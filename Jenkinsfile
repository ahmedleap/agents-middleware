pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = credentials('docker-registry-url')
        DOCKER_CREDENTIALS = credentials('docker-registry-credentials')
        NODE_ENV = 'production'
        SERVICE_NAME = 'trading-middleware'
        IMAGE_TAG = "${BUILD_NUMBER}"
        NODE_VERSION = '20'
    }

    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out code from repository...'
                checkout scm
            }
        }

        stage('Setup') {
            steps {
                echo 'Setting up Node.js environment...'
                sh '''
                    node --version
                    npm --version
                '''
            }
        }

        stage('Install Dependencies') {
            steps {
                echo 'Installing dependencies...'
                sh 'npm ci'
            }
        }

        stage('Lint') {
            steps {
                echo 'Running linting...'
                sh 'npm run lint || true'
            }
        }

        stage('Type Check') {
            steps {
                echo 'Running TypeScript type check...'
                sh 'npm run typecheck'
            }
        }

        stage('Test') {
            steps {
                echo 'Running unit tests with coverage...'
                sh '''
                    npm run test:cov -- --coverage --coverageThreshold='{"global":{"branches":80,"functions":80,"lines":80,"statements":80}}'
                '''
                publishHTML([
                    reportDir: 'coverage',
                    reportFiles: 'index.html',
                    reportName: 'Code Coverage Report'
                ])
                junit 'coverage/junit.xml' || true
            }
        }

        stage('Build') {
            steps {
                echo 'Building application...'
                sh 'npm run build'
            }
        }

        stage('Docker Build') {
            steps {
                echo 'Building Docker image...'
                sh '''
                    docker build \
                        -t ${SERVICE_NAME}:${IMAGE_TAG} \
                        -t ${SERVICE_NAME}:latest \
                        --label "build.number=${BUILD_NUMBER}" \
                        --label "build.url=${BUILD_URL}" \
                        --label "git.commit=${GIT_COMMIT}" \
                        .
                '''
            }
        }

        stage('Docker Push') {
            when {
                branch 'main'
            }
            steps {
                echo 'Pushing Docker image to registry...'
                sh '''
                    echo "${DOCKER_CREDENTIALS_PSW}" | docker login -u "${DOCKER_CREDENTIALS_USR}" --password-stdin
                    docker tag ${SERVICE_NAME}:${IMAGE_TAG} ${DOCKER_REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}
                    docker tag ${SERVICE_NAME}:latest ${DOCKER_REGISTRY}/${SERVICE_NAME}:latest
                    docker push ${DOCKER_REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}
                    docker push ${DOCKER_REGISTRY}/${SERVICE_NAME}:latest
                    docker logout
                '''
            }
        }

        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                echo 'Deploying application...'
                sh '''
                    # Deploy using docker-compose or Kubernetes
                    # Example: docker-compose -f docker-compose.prod.yml up -d
                    echo "Deployment stage - Configure with your deployment strategy"
                '''
            }
        }

        stage('Smoke Tests') {
            when {
                branch 'main'
            }
            steps {
                echo 'Running smoke tests on deployed application...'
                sh '''
                    # Wait for service to be healthy
                    sleep 10
                    
                    # Test health endpoint
                    curl -f http://localhost:3001/api/v1/health || exit 1
                    
                    echo "Smoke tests passed"
                '''
            }
        }
    }

    post {
        always {
            echo 'Cleaning up...'
            cleanWs()
        }

        success {
            echo 'Pipeline completed successfully!'
            // Add notification (email, Slack, etc.)
        }

        failure {
            echo 'Pipeline failed!'
            // Add notification (email, Slack, etc.)
        }
    }
}
