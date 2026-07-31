/**
 * 内置工具：request_user_input — HITL 向用户提问
 *
 * 设计借鉴 anything-llm AIbitat 的 `request-user-input` plugin
 * （server/utils/agents/aibitat/plugins/request-user-input.js），
 * 但用 TypeScript 重写而非移植 JS，避免 license 交叉污染。
 *
 * 工作流程：
 * 1. Agent 在 LLM 工具调用中触发 `request_user_input`
 * 2. handler 通过 `agent.interrupt('user-input-request', { questions })`
 *    暂停 Agent，emit `agent.interrupt` 事件
 * 3. UI 端订阅 `agent.interrupt`，渲染表单，收集用户答案
 * 4. UI 端调用 `agent.continue({ answers })` 恢复 Agent
 * 5. handler 返回格式化的答案字符串供 LLM 继续推理
 *
 * 注意：本工具依赖 `BaseAgent.interrupt/continue` 机制，
 * 必须通过 `AgentToolContext.agent` 注入 BaseAgent 实例。
 * 若未注入 agent，handler 将返回错误信息而非抛错，
 * 以保证 LLM 在无 HITL 环境下仍可降级处理。
 */
import { defineTool } from '../types';
import type { BaseAgent } from '../../agents/base-agent';

/** 合法的输入框类型 */
const VALID_INPUT_TYPES = ['text', 'url', 'number', 'date', 'email', 'textarea'] as const;
type ValidInputType = (typeof VALID_INPUT_TYPES)[number];

/** 单个问题的归一化结构 */
interface NormalizedQuestion {
  kind: 'input' | 'choice';
  question: string;
  inputType?: ValidInputType;
  placeholder?: string | null;
  options?: string[];
  optionDescriptions?: string[];
  multiSelect?: boolean;
  allowOther?: boolean;
}

/** 默认每轮最多提问数 */
const DEFAULT_MAX_PER_TURN = 3;
/** 默认等待用户回答的超时时间 */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * 校验并归一化单个问题。丢弃格式错误的问题而非整体拒绝。
 */
function normalizeQuestion(raw: unknown): NormalizedQuestion | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.question !== 'string' || !r.question.trim()) {
    return null;
  }

  if (r.kind === 'input') {
    const inputType = (VALID_INPUT_TYPES as readonly string[]).includes(r.inputType as string)
      ? (r.inputType as ValidInputType)
      : 'text';
    return {
      kind: 'input',
      question: (r.question as string).trim(),
      inputType,
      placeholder: typeof r.placeholder === 'string' ? r.placeholder : null,
    };
  }

  if (r.kind === 'choice') {
    const options = Array.isArray(r.options) ? (r.options as unknown[]).map(String) : [];
    if (options.length < 2) {
      return null;
    }
    return {
      kind: 'choice',
      question: (r.question as string).trim(),
      options,
      optionDescriptions: Array.isArray(r.optionDescriptions)
        ? (r.optionDescriptions as unknown[]).map(String)
        : [],
      multiSelect: !!r.multiSelect,
      allowOther: r.allowOther !== false,
    };
  }

  return null;
}

/**
 * 将用户的答案格式化为编号列表，便于 LLM 将答案映射回问题。
 * 单个问题的批次仍使用相同格式（"1. Q: ... A: ..."），无歧义。
 */
function formatAnswersForAgent(
  questions: NormalizedQuestion[],
  result: { timedOut?: boolean; skipped?: boolean; answers?: unknown[] }
): string {
  if (result.timedOut) {
    return '[no response within the time limit — proceed using your best judgment]';
  }
  if (result.skipped) {
    return '[user skipped — proceed using your best judgment]';
  }

  const lines = questions.map((q, i) => {
    const a = (result.answers?.[i] ?? { skipped: true }) as {
      skipped?: boolean;
      answer?: unknown;
    };
    let answerText: string;
    if (a.skipped) {
      answerText = '[user skipped]';
    } else if (Array.isArray(a.answer)) {
      answerText = (a.answer as unknown[]).map(String).join(', ');
    } else if (a.answer === null || a.answer === undefined || a.answer === '') {
      answerText = '[no answer]';
    } else {
      answerText = String(a.answer);
    }
    return `${i + 1}. Q: ${q.question}\n   A: ${answerText}`;
  });
  return lines.join('\n');
}

/**
 * 创建 request_user_input 工具。
 *
 * @param agent BaseAgent 实例，用于调用 interrupt/continue（可选）
 * @param options 配置项
 * @param options.maxPerTurn 每轮最多提问数（默认 3）
 * @param options.timeoutMs 等待用户回答的超时时间（默认 120s）
 */
export function createRequestUserInputTool(
  agent?: BaseAgent,
  options?: { maxPerTurn?: number; timeoutMs?: number }
) {
  const maxPerTurn = options?.maxPerTurn ?? DEFAULT_MAX_PER_TURN;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let askedThisTurn = 0;

  return defineTool(
    'request_user_input',
    'Prompt the user for input via an interactive form. ' +
      'This is the ONLY way to ask the user questions - text responses cannot receive replies. ' +
      'Call this tool when you need a URL, file path, name, date, preference, ' +
      'or any other detail to proceed. The user will see a form and their answers are returned to you.',
    {
      questions: {
        type: 'array',
        description:
          'Array of independent question objects. Use one for a single clarifying question; ' +
          "batch multiple when they don't depend on each other.",
      },
    },
    ['questions'],
    async (args) => {
      // ── 防御性校验 ──────────────────────────────────────
      if (!agent) {
        return '[request_user_input unavailable: no HITL agent bound — proceed using your best judgment]';
      }
      if (!Array.isArray(args.questions) || args.questions.length < 1) {
        return "[request_user_input requires a 'questions' array with at least 1 entry]";
      }

      // ── 归一化与截断 ────────────────────────────────────
      const normalized = (args.questions as unknown[])
        .map((q) => normalizeQuestion(q))
        .filter((q): q is NormalizedQuestion => q !== null);
      if (normalized.length < 1) {
        return '[request_user_input received no well-formed questions after validation]';
      }

      const remaining = maxPerTurn - askedThisTurn;
      if (remaining <= 0) {
        return `[clarification limit of ${maxPerTurn} reached for this turn — do not ask again, proceed with best judgment]`;
      }

      const truncated = normalized.slice(0, remaining);
      const truncatedNote =
        truncated.length < normalized.length
          ? ` (truncated from ${normalized.length} to fit the per-turn cap of ${maxPerTurn})`
          : '';
      askedThisTurn += truncated.length;

      // ── HITL：interrupt 等待用户回答 ────────────────────
      // 通过 BaseAgent.interrupt 暂停 Agent，
      // UI 端订阅 agent.interrupt 事件后渲染表单，
      // 收集答案后调用 agent.continue({ answers, timedOut, skipped }) 恢复。
      const decision = await agent.interrupt('user-input-request', {
        questions: truncated,
        timeoutMs,
        allowSkip: true,
      });

      // ── 格式化答案返回给 LLM ────────────────────────────
      const result = (decision as {
        answers?: unknown[];
        timedOut?: boolean;
        skipped?: boolean;
      }) ?? { timedOut: true };

      return formatAnswersForAgent(truncated, result) + truncatedNote;
    }
  );
}
