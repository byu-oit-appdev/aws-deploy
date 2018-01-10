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
import { expect } from 'chai';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as cloudFormationCalls from '../../../src/aws/cloudformation-calls';
import * as ssmCalls from '../../../src/aws/ssm-calls';
import * as bindPhaseCommon from '../../../src/common/bind-phase-common';
import * as deletePhasesCommon from '../../../src/common/delete-phases-common';
import * as preDeployPhaseCommon from '../../../src/common/pre-deploy-phase-common';
import * as rdsDeployersCommon from '../../../src/common/rds-deployers-common';
import { AccountConfig, BindContext, DeployContext, PreDeployContext, ServiceConfig, ServiceContext, UnBindContext, UnDeployContext, UnPreDeployContext } from '../../../src/datatypes';
import * as mysql from '../../../src/services/mysql';
import { MySQLConfig } from '../../../src/services/mysql';

describe('mysql deployer', () => {
    let sandbox: sinon.SinonSandbox;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    let serviceContext: ServiceContext<MySQLConfig>;
    let serviceParams: MySQLConfig;
    let accountConfig: AccountConfig;

    beforeEach(() => {
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(retAccountConfig => {
                sandbox = sinon.sandbox.create();
                accountConfig = retAccountConfig;
                serviceParams = {
                    type: 'mysql',
                    mysql_version: '5.6.27',
                    database_name: 'mydb'
                };
                serviceContext = new ServiceContext(appName, envName, 'FakeService', 'mysql', serviceParams, retAccountConfig);
            });
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should require the database_name parameter', () => {
            delete serviceContext.params.database_name;
            const errors = mysql.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'database_name' parameter is required`);
        });

        it('should require the mysql_version parameter', () => {
            delete serviceContext.params.mysql_version;
            const errors = mysql.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'mysql_version' parameter is required`);
        });

        it('should work when all required parameters are provided properly', () => {
            const errors = mysql.check(serviceContext, []);
            expect(errors.length).to.equal(0);
        });
    });

    describe('preDeploy', () => {
        it('should create a security group', () => {
            const groupId = 'FakeSgGroupId';
            const preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push({
                GroupId: groupId
            });
            const createSgStub = sandbox.stub(preDeployPhaseCommon, 'preDeployCreateSecurityGroup')
                .returns(Promise.resolve(preDeployContext));

            return mysql.preDeploy(serviceContext)
                .then(retPreDeployContext => {
                    expect(retPreDeployContext).to.be.instanceof(PreDeployContext);
                    expect(retPreDeployContext.securityGroups.length).to.equal(1);
                    expect(retPreDeployContext.securityGroups[0].GroupId).to.equal(groupId);
                    expect(createSgStub.callCount).to.equal(1);
                });
        });
    });

    describe('bind', () => {
        it('should add the source sg to its own sg as an ingress rule', () => {
            const dependencyServiceContext = new ServiceContext(appName, envName, 'FakeService',
                                                                'postgresql', serviceParams, accountConfig);
            const dependencyPreDeployContext = new PreDeployContext(dependencyServiceContext);
            const dependentOfServiceContext = new ServiceContext(appName, envName, 'FakeService',
            'beanstalk', {type: 'beanstalk'}, accountConfig);
            const dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);
            const bindSgStub = sandbox.stub(bindPhaseCommon, 'bindDependentSecurityGroupToSelf')
                .returns(Promise.resolve(new BindContext(dependencyServiceContext, dependentOfServiceContext)));

            return mysql.bind(dependencyServiceContext, dependencyPreDeployContext,
                              dependentOfServiceContext, dependentOfPreDeployContext)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                    expect(bindSgStub.callCount).to.equal(1);
                });
        });
    });

    describe('deploy', () => {
        const envPrefix = 'FAKESERVICE';
        const databaseAddress = 'fakeaddress.amazonaws.com';
        const databasePort = 3306;
        const databaseName = 'mydb';
        let ownPreDeployContext: PreDeployContext;
        let dependenciesDeployContexts: DeployContext[];
        const deployedStack = {
            Outputs: [
                {
                    OutputKey: 'DatabaseAddress',
                    OutputValue: databaseAddress
                },
                {
                    OutputKey: 'DatabasePort',
                    OutputValue: databasePort
                },
                {
                    OutputKey: 'DatabaseName',
                    OutputValue: databaseName
                }
            ]
        };

        beforeEach(() => {
            ownPreDeployContext = new PreDeployContext(serviceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: 'FakeId'
            });

            dependenciesDeployContexts = [];
        });

        it('should create the cluster if it doesnt exist', () => {
            const getStackStub = sandbox.stub(cloudFormationCalls, 'getStack').returns(Promise.resolve(null));
            const createStackStub = sandbox.stub(cloudFormationCalls, 'createStack')
                .returns(Promise.resolve(deployedStack));
            const addCredentialsStub = sandbox.stub(rdsDeployersCommon, 'addDbCredentialToParameterStore')
                .returns(Promise.resolve(deployedStack));

            return mysql.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(getStackStub.callCount).to.equal(1);
                    expect(createStackStub.callCount).to.equal(1);
                    expect(addCredentialsStub.callCount).to.equal(1);
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.environmentVariables[`${envPrefix}_ADDRESS`]).to.equal(databaseAddress);
                    expect(deployContext.environmentVariables[`${envPrefix}_PORT`]).to.equal(databasePort);
                    expect(deployContext.environmentVariables[`${envPrefix}_DATABASE_NAME`]).to.equal(databaseName);
                });
        });

        it('should not update the database if it already exists', () => {
            const getStackStub = sandbox.stub(cloudFormationCalls, 'getStack').returns(Promise.resolve(deployedStack));
            const updateStackStub = sandbox.stub(cloudFormationCalls, 'updateStack').returns(Promise.resolve(null));

            return mysql.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(getStackStub.callCount).to.equal(1);
                    expect(updateStackStub.callCount).to.equal(0);
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.environmentVariables[`${envPrefix}_ADDRESS`]).to.equal(databaseAddress);
                    expect(deployContext.environmentVariables[`${envPrefix}_PORT`]).to.equal(databasePort);
                    expect(deployContext.environmentVariables[`${envPrefix}_DATABASE_NAME`]).to.equal(databaseName);
                });
        });
    });

    describe('unPreDeploy', () => {
        it('should delete the security group', () => {
            const unPreDeployStub = sandbox.stub(deletePhasesCommon, 'unPreDeploySecurityGroup')
                .returns(Promise.resolve(new UnPreDeployContext(serviceContext)));

            return mysql.unPreDeploy(serviceContext)
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeployStub.callCount).to.equal(1);
                });
        });
    });

    describe('unBind', () => {
        it('should unbind the security group', () => {
            const unBindStub = sandbox.stub(deletePhasesCommon, 'unBindSecurityGroups')
                .returns(Promise.resolve(new UnBindContext(serviceContext)));

            return mysql.unBind(serviceContext)
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                    expect(unBindStub.callCount).to.equal(1);
                });
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', () => {
            const unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService')
                .returns(Promise.resolve(new UnDeployContext(serviceContext)));
            const deleteParametersStub = sandbox.stub(ssmCalls, 'deleteParameters').returns(Promise.resolve({}));

            return mysql.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.callCount).to.equal(1);
                    expect(deleteParametersStub.callCount).to.equal(1);
                });
        });
    });
});