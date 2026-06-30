pipeline {

    agent any

    environment {
        AWS_REGION = "us-east-1"
        ECR_REPO = "590999018668.dkr.ecr.us-east-1.amazonaws.com/demo-app"
        IMAGE_TAG = "${BUILD_NUMBER}"
    }

    stages {

        stage('Clone Repository') {
            steps {
                git branch: 'main',
                url: 'https://github.com/rk4027-N/Demo-Challenge.git'
            }
        }
       stage('Install Dependencies') {
            steps {
                dir('app') {
                    sh 'npm install'
                }
            }
        }

        stage('Run Unit Tests') {
            steps {
                dir('app') {
                    sh 'npm test || true'
                }
            }
        }

        stage('SonarQube Scan') {
            environment {
                SCANNER_HOME = tool 'sonar'
            }
            steps {
                withSonarQubeEnv('sonar') {
                    dir('app') {
                        sh '''
                        ${SCANNER_HOME}/bin/sonar-scanner \
                        -Dsonar.projectKey=demo-app \
                        -Dsonar.sources=. \
                        -Dsonar.projectName=demo-app
                        '''
                    }
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Trivy Filesystem Scan') {
            steps {
                sh '''
                trivy fs \
                --exit-code 1 \
                --severity HIGH,CRITICAL \
                ./app
                '''
            }
        }

        stage('Docker Build') {
            steps {
                sh '''
                docker build -t demo-app:${IMAGE_TAG} .
                '''
            }
        }

        stage('Trivy Image Scan') {
            steps {
                sh '''
                trivy image --severity HIGH,CRITICAL demo-app:${IMAGE_TAG}
                '''
            }
        }

        stage('Push To ECR') {
            steps {
                sh '''
                aws ecr get-login-password --region ${AWS_REGION} | \
                docker login --username AWS --password-stdin 590999018668.dkr.ecr.us-east-1.amazonaws.com

                docker tag demo-app:${IMAGE_TAG} ${ECR_REPO}:${IMAGE_TAG}

                docker push ${ECR_REPO}:${IMAGE_TAG}
                '''
            }
        }

        stage('Update Manifest And Push') {
            steps {

                withCredentials([string(credentialsId: 'github', variable: 'GITHUB_TOKEN')]) {

                    sh '''
                    sed -i "s|image:.*|image: ${ECR_REPO}:${IMAGE_TAG}|g" k8smanifests/deploy.yml

                    git config --global user.email "jenkins@example.com"
                    git config --global user.name "jenkins"

                    git remote set-url origin https://${GITHUB_TOKEN}@github.com/rk4027-N/Demo-Challenge.git

                    git add k8smanifests/deploy.yml

                    git commit -m "Updated image to ${IMAGE_TAG}" || true

                    git push origin main
                    '''
                }
            }
        }
    }
    post {

    success {

        withCredentials([
            string(credentialsId: 'slack-webhook', variable: 'WEBHOOK')
        ]) {

            sh """
            curl -X POST \$WEBHOOK \
            -H 'Content-Type: application/json' \
            --data '{
                "text":"✅ Build #${BUILD_NUMBER} Successful\\nJob: ${JOB_NAME}"
            }'
            """
        }
    }

    failure {

        withCredentials([
            string(credentialsId: 'slack-webhook', variable: 'WEBHOOK')
        ]) {

            sh """
            curl -X POST \$WEBHOOK \
            -H 'Content-Type: application/json' \
            --data '{
                "text":"❌ Build #${BUILD_NUMBER} Failed\\nJob: ${JOB_NAME}\\n${BUILD_URL}"
            }'
            """
        }
    }

}
}

