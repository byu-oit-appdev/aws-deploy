/*
 * Copyright 2017 Brigham Young University
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
const ServiceContext = require('../../lib/datatypes/service-context');
const DeployContext = require('../../lib/datatypes/deploy-context');
const UnDeployContext = require('../../lib/datatypes/un-deploy-context');
const deployPhaseCommon = require('../../lib/common/deploy-phase-common');
const iamCalls = require('../../lib/aws/iam-calls');
const s3Calls = require('../../lib/aws/s3-calls');
const cloudformationCalls = require('../../lib/aws/cloudformation-calls');
const util = require('../../lib/common/util');
const ec2Calls = require('../../lib/aws/ec2-calls');
const fs = require('fs');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('Deploy phase common module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('getInjectedEnvVarName', function () {
        it('should return the environment variable name from the given ServiceContext and suffix', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let envVarName = deployPhaseCommon.getInjectedEnvVarName(serviceContext, "SOME_INFO");
            expect(envVarName).to.equal("FAKETYPE_FAKEAPP_FAKEENV_FAKESERVICE_SOME_INFO");
        });
    });

    describe('getEnvVarsFromServiceContext', function () {
        it('should return an object with the env vars to inject from the service context', function () {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let serviceName = "FakeService";
            let deployVersion = "1";
            let serviceContext = new ServiceContext(appName, envName, serviceName, "apigateway", deployVersion, {});
            let returnEnvVars = deployPhaseCommon.getEnvVarsFromServiceContext(serviceContext);
            expect(returnEnvVars['HANDEL_APP_NAME']).to.equal(appName);
            expect(returnEnvVars['HANDEL_ENVIRONMENT_NAME']).to.equal(envName);
            expect(returnEnvVars['HANDEL_SERVICE_NAME']).to.equal(serviceName);
            expect(returnEnvVars['HANDEL_SERVICE_VERSION']).to.equal(deployVersion);
        });
    });

    describe('getEnvVarsFromDependencyDeployContexts', function () {
        it('should return an object with the env vars from all given DeployContexts', function () {
            let deployContexts = []
            let serviceContext1 = new ServiceContext("FakeApp", "FakeEnv", "FakeService1", "FakeType1", "1", {});
            let deployContext1 = new DeployContext(serviceContext1);
            let envVarName1 = "ENV_VAR_1";
            let envVarValue1 = "someValue1";
            deployContext1.environmentVariables[envVarName1] = envVarValue1;
            deployContexts.push(deployContext1);

            let serviceContext2 = new ServiceContext("FakeApp", "FakeEnv", "FakeService2", "FakeType2", "1", {});
            let deployContext2 = new DeployContext(serviceContext2);
            let envVarName2 = "ENV_VAR_2";
            let envVarValue2 = "someValue2";
            deployContext2.environmentVariables[envVarName2] = envVarValue2;
            deployContexts.push(deployContext2);

            let returnVars = deployPhaseCommon.getEnvVarsFromDependencyDeployContexts(deployContexts);

            expect(returnVars[envVarName1]).to.equal(envVarValue1);
            expect(returnVars[envVarName2]).to.equal(envVarValue2);
        });
    });

    describe('createCustomRole', function () {
        it('should create the role if it doesnt exist', function () {
            let createRoleStub = sandbox.stub(iamCalls, 'createRole').returns(Promise.resolve({}));
            let createOrUpdatePolicy = sandbox.stub(iamCalls, 'createOrUpdatePolicy').returns(Promise.resolve({
                Arn: "FakeArn"
            }));
            let attachPolicyStub = sandbox.stub(iamCalls, 'attachPolicyToRole').returns(Promise.resolve({}));
            let getRoleStub = sandbox.stub(iamCalls, 'getRole').returns(Promise.resolve(null));

            return deployPhaseCommon.createCustomRole("ecs.amazonaws.com", "MyRole", [{}])
                .then(role => {
                    expect(getRoleStub.calledTwice).to.be.true;
                    expect(createRoleStub.calledOnce).to.be.true;
                    expect(createOrUpdatePolicy.calledOnce).to.be.true;
                    expect(attachPolicyStub.calledOnce).to.be.true;
                });
        });

        it('should return the role if it already exists', function () {
            let createRoleStub = sandbox.stub(iamCalls, 'createRoleIfNotExists').returns(Promise.resolve({}));
            let getRoleStub = sandbox.stub(iamCalls, 'getRole').returns(Promise.resolve({}));

            return deployPhaseCommon.createCustomRole("ecs.amazonaws.com", "MyRole", [])
                .then(role => {
                    expect(getRoleStub.calledOnce).to.be.true;
                    expect(createRoleStub.notCalled).to.be.true;
                    expect(role).to.deep.equal({});
                });
        });
    });

    describe('getAllPolicyStatementsForServiceRole', function () {
        it('should return the combination of policy statements from the own service and its dependencies', function () {
            let ownServicePolicyStatements = [{
                "Effect": "Allow",
                "Action": [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                ],
                "Resource": [
                    "arn:aws:logs:*:*:*"
                ]
            }];

            let dependenciesDeployContexts = [];
            let dependencyServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "sqs", "1", {});
            let dependencyDeployContext = new DeployContext(dependencyServiceContext);
            dependencyDeployContext.policies.push({
                "Effect": "Allow",
                "Action": [
                    "sqs:ChangeMessageVisibility",
                    "sqs:ChangeMessageVisibilityBatch",
                    "sqs:DeleteMessage",
                    "sqs:DeleteMessageBatch",
                    "sqs:GetQueueAttributes",
                    "sqs:GetQueueUrl",
                    "sqs:ListDeadLetterSourceQueues",
                    "sqs:ListQueues",
                    "sqs:PurgeQueue",
                    "sqs:ReceiveMessage",
                    "sqs:SendMessage",
                    "sqs:SendMessageBatch"
                ],
                "Resource": [
                    "SomeQueueArn"
                ]
            });
            dependenciesDeployContexts.push(dependencyDeployContext);

            let policyStatements = deployPhaseCommon.getAllPolicyStatementsForServiceRole(ownServicePolicyStatements, dependenciesDeployContexts);
            expect(policyStatements.length).to.equal(2);
        });
    });

    describe('deployCloudFormationStack', function() {
        it('should create the stack if it doesnt exist yet', function() {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudformationCalls, 'createStack').returns(Promise.resolve({}));
            return deployPhaseCommon.deployCloudFormationStack("FakeStack", "", [], true, "FakeService")
                .then(deployedStack => {
                    expect(deployedStack).to.deep.equal({});
                    expect(getStackStub.callCount).to.equal(1);
                    expect(createStackStub.callCount).to.equal(1);
                });
        });

        it('should update the stack if it exists and updates are supported', function() {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let updateStackStub = sandbox.stub(cloudformationCalls, 'updateStack').returns(Promise.resolve({}));
            return deployPhaseCommon.deployCloudFormationStack("FakeStack", "", [], true, "FakeService")
                .then(deployedStack => {
                    expect(deployedStack).to.deep.equal({});
                    expect(getStackStub.callCount).to.equal(1);
                    expect(updateStackStub.callCount).to.equal(1);
                });
        });

        it('should just return the stack if it exists and updates are not supported', function() {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let updateStackStub = sandbox.stub(cloudformationCalls, 'updateStack').returns(Promise.resolve(null));
            return deployPhaseCommon.deployCloudFormationStack("FakeStack", "", [], false, "FakeService")
                .then(deployedStack => {
                    expect(deployedStack).to.deep.equal({});
                    expect(getStackStub.callCount).to.equal(1);
                    expect(updateStackStub.callCount).to.equal(0);
                });
        });
    });

    describe('uploadFileToHandelBucket', function () {
        it('should upload the given file to the bucket', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let diskFilePath = "FakePath";
            let s3FileName = "SomeFileName";

            //Stub out dependent services
            let createBucketStub = sandbox.stub(s3Calls, 'createBucketIfNotExists').returns(Promise.resolve({}));
            let uploadFileStub = sandbox.stub(s3Calls, 'uploadFile').returns({});
            let cleanupOldVersionsStub = sandbox.stub(s3Calls, 'cleanupOldVersionsOfFiles').returns(Promise.resolve(null));

            return deployPhaseCommon.uploadFileToHandelBucket(serviceContext, diskFilePath, s3FileName)
                .then(s3ObjectInfo => {
                    expect(createBucketStub.calledOnce).to.be.true;
                    expect(uploadFileStub.calledOnce).to.be.true;
                    expect(cleanupOldVersionsStub.calledOnce).to.be.true;
                    expect(s3ObjectInfo).to.deep.equal({});
                });
        });
    });

    describe('uploadDeployableArtifactToHandelBucket', function () {
        it('should upload a file to the given s3 location', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                path_to_code: `${__dirname}/mytestartifact.war`
            });
            let s3FileName = "FakeS3Filename";

            let uploadFileToHandelBucketStub = sandbox.stub(deployPhaseCommon, 'uploadFileToHandelBucket').returns(Promise.resolve({}));

            return deployPhaseCommon.uploadDeployableArtifactToHandelBucket(serviceContext, s3FileName)
                .then(s3ObjectInfo => {
                    expect(uploadFileToHandelBucketStub.calledOnce).to.be.true;
                    expect(s3ObjectInfo).to.deep.equal({});
                });
        });

        it('should zip and upload a directory to the given s3 location', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                path_to_code: __dirname
            });
            let s3FileName = "FakeS3Filename";

            let zipDirectoryToFileStub = sandbox.stub(util, 'zipDirectoryToFile').returns(Promise.resolve({}));
            let uploadFileToHandelBucketStub = sandbox.stub(deployPhaseCommon, 'uploadFileToHandelBucket').returns(Promise.resolve({}));
            let unlinkSyncStub = sandbox.stub(fs, 'unlinkSync').returns(null);

            return deployPhaseCommon.uploadDeployableArtifactToHandelBucket(serviceContext, s3FileName)
                .then(s3ObjectInfo => {
                    expect(zipDirectoryToFileStub.calledOnce).to.be.true;
                    expect(uploadFileToHandelBucketStub.calledOnce).to.be.true;
                    expect(unlinkSyncStub.calledOnce).to.be.true;
                    expect(s3ObjectInfo).to.deep.equal({});
                });
        });
    });

    describe('getAppSecretsAccessPolicyStatements', function () {
        it('should return an array of two permissions allowing it to access secrets in its namespace', function () {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let serviceName = "FakeService";
            let serviceContext = new ServiceContext(appName, envName, serviceName, "lambda", "1", {});
            let policyStatements = deployPhaseCommon.getAppSecretsAccessPolicyStatements(serviceContext);
            expect(policyStatements.length).to.equal(2);
            expect(policyStatements[1].Resource[0]).to.contain(`parameter/${appName}.${envName}*`)
        });
    });

    describe('getEventConsumerConfigParams', function () {
        let appName = "FakeApp";
        let envName = "FakeEnv";
        let deployVersion = "1";
        let consumerServiceName = "ConsumerServiceName";
        let consumerServiceContext = new ServiceContext(appName, envName, consumerServiceName, "lambda", deployVersion, {});
        let producerServiceName = "ProducerServiceName";

        it('should return the config for the consumer from the producer', function () {
            let eventInputVal = '{"notify": false}';
            let producerServiceContext = new ServiceContext(appName, envName, producerServiceName, "cloudwatchevent", deployVersion, {
                event_consumers: [{
                    service_name: consumerServiceName,
                    event_input: eventInputVal
                }]
            });

            let eventConsumerConfig = deployPhaseCommon.getEventConsumerConfigParams(producerServiceContext, consumerServiceContext);
            expect(eventConsumerConfig).to.not.be.null;
            expect(eventConsumerConfig.event_input).to.equal(eventInputVal);
        });

        it('should return null when no config exists in the producer for the consumer', function () {
            let producerServiceContext = new ServiceContext(appName, envName, producerServiceName, "cloudwatchevent", deployVersion, {
                event_consumers: []
            });

            let eventConsumerConfig = deployPhaseCommon.getEventConsumerConfigParams(producerServiceContext, consumerServiceContext);
            expect(eventConsumerConfig).to.be.null;
        });
    });
});