# CI/CD 集成

YuanTest Playwright 可以轻松集成到各种 CI/CD 平台。

## GitHub Actions

创建 `.github/workflows/test.yml`：

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      
      - name: Install YuanTest
        run: npm install -g yuantest-playwright
      
      - name: Run tests
        run: |
          yuantest run \
            --test-dir ./ \
            --output ./test-reports \
            --shards 4
        continue-on-error: true
      
      - name: Upload test reports
        uses: actions/upload-artifact@v3
        with:
          name: test-reports
          path: test-reports/
          retention-days: 30
```

## GitLab CI

创建 `.gitlab-ci.yml`：

```yaml
e2e-tests:
  image: mcr.microsoft.com/playwright:v1.40.0-jammy
  stage: test
  script:
    - npm ci
    - npm install -g yuantest-playwright
    - yuantest run --test-dir ./ --output ./test-reports --shards 4
  artifacts:
    when: always
    paths:
      - test-reports/
    expire_in: 30 days
  allow_failure: true
```

## Jenkins

Jenkinsfile 示例：

```groovy
pipeline {
    agent any
    
    stages {
        stage('Install') {
            steps {
                sh 'npm ci'
                sh 'npm install -g yuantest-playwright'
                sh 'npx playwright install --with-deps'
            }
        }
        
        stage('Test') {
            steps {
                sh 'yuantest run --test-dir ./ --output ./test-reports --shards 4'
            }
            post {
                always {
                    archiveArtifacts artifacts: 'test-reports/**/*', allowEmptyArchive: true
                }
            }
        }
    }
}
```

## CircleCI

`.circleci/config.yml` 示例：

```yaml
version: 2.1

jobs:
  test:
    docker:
      - image: mcr.microsoft.com/playwright:v1.40.0-jammy
    steps:
      - checkout
      - run:
          name: Install dependencies
          command: npm ci
      - run:
          name: Install YuanTest
          command: npm install -g yuantest-playwright
      - run:
          name: Run tests
          command: yuantest run --test-dir ./ --output ./test-reports --shards 4
          when: always
      - store_artifacts:
          path: test-reports

workflows:
  version: 2
  test:
    jobs:
      - test
```

## Azure DevOps

`azure-pipelines.yml` 示例：

```yaml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '18.x'
    displayName: 'Install Node.js'

  - script: npm ci
    displayName: 'Install dependencies'

  - script: npm install -g yuantest-playwright
    displayName: 'Install YuanTest'

  - script: npx playwright install --with-deps
    displayName: 'Install Playwright browsers'

  - script: yuantest run --test-dir ./ --output ./test-reports --shards 4
    displayName: 'Run tests'
    continueOnError: true

  - task: PublishBuildArtifacts@1
    inputs:
      pathToPublish: 'test-reports'
      artifactName: 'test-reports'
```

## 最佳实践

### 1. 使用分片加速测试

```bash
# 在 CI 中使用分片
yuantest run --test-dir ./ --shards 4 --output ./reports
```

### 2. 隔离 Flaky 测试

```bash
# 在 CI 中先隔离 Flaky 测试
yuantest flaky --quarantine-all
yuantest run --test-dir ./
```

### 3. 保留测试报告

确保将测试报告作为 CI artifact 上传，以便后续分析。

### 4. 设置超时

```bash
# 设置合理的超时时间
yuantest run --test-dir ./ --timeout 60000
```

### 5. 失败重试

```bash
# 在 CI 中启用重试
yuantest run --test-dir ./ --retries 2
```
