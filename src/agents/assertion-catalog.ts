export const ASSERTION_CATALOG_ZH = `Playwright 断言与定位方法速查:

【页面断言】
- expect(locator).toBeVisible() — 断言元素可见
- expect(locator).toBeHidden() — 断言元素隐藏
- expect(locator).toBeEnabled() — 断言元素可用
- expect(locator).toBeDisabled() — 断言元素禁用
- expect(locator).toBeChecked() — 断言复选框已选中
- expect(locator).toBeEditable() — 断言输入框可编辑
- expect(locator).toBeEmpty() — 断言元素内容为空
- expect(locator).toBeFocused() — 断言元素获得焦点

【文本断言】
- expect(locator).toHaveText(text) — 断言文本完全匹配
- expect(locator).toContainText(text) — 断言包含文本
- expect(locator).toHaveValue(value) — 断言输入框值
- expect(locator).toHaveAttribute(name, value) — 断言属性值

【状态断言】
- expect(locator).toHaveClass(cls) — 断言 CSS 类名
- expect(locator).toHaveCSS(prop, val) — 断言 CSS 属性
- expect(locator).toHaveCount(n) — 断言匹配元素数量
- expect(page).toHaveURL(url) — 断言页面 URL
- expect(page).toHaveTitle(title) — 断言页面标题

【等待方法】
- locator.waitFor() — 等待定位器状态
- page.waitForSelector(sel) — 等待选择器出现
- page.waitForURL(url) — 等待页面跳转
- page.waitForNavigation() — 等待导航完成
- page.waitForLoadState(state) — 等待加载状态(load/domcontentloaded/networkidle)
- page.waitForResponse(urlOrPred) — 等待响应

【定位方法】
- page.getByRole(role, { name }) — 按角色和名称定位
- page.getByText(text) — 按文本定位
- page.getByLabel(text) — 按标签定位
- page.getByPlaceholder(text) — 按占位符定位
- page.getByTestId(id) — 按测试ID定位
- page.getByAltText(text) — 按alt文本定位
- page.getByTitle(text) — 按title定位
- page.locator(sel) — 通用CSS/XPath定位`;

export const ASSERTION_CATALOG_EN = `Playwright Assertion & Locator Quick Reference:

[Page Assertions]
- expect(locator).toBeVisible() — assert element is visible
- expect(locator).toBeHidden() — assert element is hidden
- expect(locator).toBeEnabled() — assert element is enabled
- expect(locator).toBeDisabled() — assert element is disabled
- expect(locator).toBeChecked() — assert checkbox is checked
- expect(locator).toBeEditable() — assert input is editable
- expect(locator).toBeEmpty() — assert element is empty
- expect(locator).toBeFocused() — assert element is focused

[Text Assertions]
- expect(locator).toHaveText(text) — assert exact text match
- expect(locator).toContainText(text) — assert contains text
- expect(locator).toHaveValue(value) — assert input value
- expect(locator).toHaveAttribute(name, value) — assert attribute value

[State Assertions]
- expect(locator).toHaveClass(cls) — assert CSS class
- expect(locator).toHaveCSS(prop, val) — assert CSS property
- expect(locator).toHaveCount(n) — assert matching element count
- expect(page).toHaveURL(url) — assert page URL
- expect(page).toHaveTitle(title) — assert page title

[Wait Methods]
- locator.waitFor() — wait for locator state
- page.waitForSelector(sel) — wait for selector to appear
- page.waitForURL(url) — wait for page navigation
- page.waitForNavigation() — wait for navigation to complete
- page.waitForLoadState(state) — wait for load state(load/domcontentloaded/networkidle)
- page.waitForResponse(urlOrPred) — wait for response

[Locator Methods]
- page.getByRole(role, { name }) — locate by ARIA role and name
- page.getByText(text) — locate by text content
- page.getByLabel(text) — locate by label text
- page.getByPlaceholder(text) — locate by placeholder
- page.getByTestId(id) — locate by data-testid
- page.getByAltText(text) — locate by alt text
- page.getByTitle(text) — locate by title attribute
- page.locator(sel) — generic CSS/XPath selector`;
