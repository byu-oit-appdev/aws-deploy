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
const accountConfig = require('../../../lib/common/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const iot = require('../../../lib/services/iot');
const cloudformationCalls = require('../../../lib/aws/cloudformation-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const ProduceEventsContext = require('../../../lib/datatypes/produce-events-context');
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('lambda deployer', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should return an error when the service_name param is not specified in event_consumers', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "iot", "1", {
                event_consumers: [{
                    sql: "select * from 'something'"
                }]
            });
            let errors = iot.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'service_name' parameter is required");
        });

        it('should return an error when the sql parameter is not specified in the event_consumers seciton', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "iot", "1", {
                event_consumers: [{
                    service_name: 'myconsumer',
                }]
            });
            let errors = iot.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'sql' parameter is required");
        });

        it('should return no errors when configured properly', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "iot", "1", {
                event_consumers: [{
                    service_name: 'myconsumer',
                    sql: "select * from 'something'"
                }]
            });
            let errors = iot.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('deploy', function () {
        it('should return an empty deploy context', function () {
            return iot.deploy({}, {}, {})
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                });
        });
    });

    describe('produceEvents', function () {
        let appName = "FakeApp";
        let envName = "FakeEnv";
        let version = "1";
        let ownServiceContext = new ServiceContext(appName, envName, "FakeProducer", "iot", version, {
            event_consumers: [{
                service_name: "FakeConsumer",
                sql: "select * from something;",
                ruleDisabled: false
            }]
        });
        let ownDeployContext = new DeployContext(ownServiceContext);


        it('should create topic rules when lambda is the event consumer', function () {
            let consumerServiceContext = new ServiceContext(appName, envName, "FakeConsumer", "lambda", version, {});
            let consumerDeployContext = new DeployContext(consumerServiceContext);
            consumerDeployContext.eventOutputs.lambdaArn = "FakeArn";

            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [
                    {
                        OutputKey: 'TopicRuleName',
                        OutputValue: "MyRuleName",
                    }
                ]
            }));

            return iot.produceEvents(ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext)
                .then(produceEventsContext => {
                    expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
                    expect(deployStackStub.callCount).to.equal(1);
                });
        });

        it('should return an error if any other consumer type is specified', function () {
            let consumerServiceContext = new ServiceContext(appName, envName, "FakeConsumer", "unknowntype", version, {});
            let consumerDeployContext = new DeployContext(consumerServiceContext);
            
            return iot.produceEvents(ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext)
                .then(produceEventsContext => {
                    expect(true).to.equal(false); //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Unsupported event consumer type")
                })
        })
    });

    describe('unDeploy', function () {
        it('should delete the topic rule stacks', function () {
            let ownServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "iot", "1", {
                event_consumers: [
                    {
                        service_name: "A"
                    },
                    {
                        service_name: "B"
                    }
                ]
            });

            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').returns(Promise.resolve({}));

            return iot.unDeploy(ownServiceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(getStackStub.callCount).to.equal(2);
                    expect(deleteStackStub.callCount).to.equal(2);
                })
        });
    });
});