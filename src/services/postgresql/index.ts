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
import * as winston from 'winston';
import * as cloudFormationCalls from '../../aws/cloudformation-calls';
import * as bindPhaseCommon from '../../common/bind-phase-common';
import * as deletePhasesCommon from '../../common/delete-phases-common';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as handlebarsUtils from '../../common/handlebars-utils';
import * as preDeployPhaseCommon from '../../common/pre-deploy-phase-common';
import * as rdsDeployersCommon from '../../common/rds-deployers-common';
import { BindContext, DeployContext, PreDeployContext, ServiceConfig, ServiceContext, UnBindContext, UnDeployContext, UnPreDeployContext, Tags } from '../../datatypes';

export interface PostgreSQLConfig extends ServiceConfig {
    postgres_version: string;
    database_name: string;
    description?: string;
    instance_type?: string;
    storage_gb?: number;
    storage_type?: PostgreSQLStorageType;
    db_parameters?: PostgreSQLDbParameters;
    multi_az?: boolean;
    tags?: Tags;
}

enum PostgreSQLStorageType {
    standard, gp2
}

interface PostgreSQLDbParameters {
    [key: string]: string;
}

const SERVICE_NAME = 'PostgreSQL';
const POSTGRES_PORT = 5432;
const POSTGRES_PROTOCOL = 'tcp';

function getParameterGroupFamily(postgresVersion: string) {
    if (postgresVersion.startsWith('9.3')) {
        return 'postgres9.3';
    }
    else if (postgresVersion.startsWith('9.4')) {
        return 'postgres9.4';
    }
    else if (postgresVersion.startsWith('9.5')) {
        return 'postgres9.5';
    }
    else {
        return 'postgres9.6';
    }
}

// TODO - Better return type once compileTemplate is moved to TS
function getCompiledPostgresTemplate(stackName: string,
                                     ownServiceContext: ServiceContext<PostgreSQLConfig>,
                                     ownPreDeployContext: PreDeployContext): any {
    const serviceParams = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;

    const postgresVersion = serviceParams.postgres_version;

    const handlebarsParams: any = {
        description: serviceParams.description || 'Parameter group for ' + stackName,
        storageGB: serviceParams.storage_gb || 5,
        instanceType: serviceParams.instance_type || 'db.t2.micro',
        stackName,
        databaseName: serviceParams.database_name,
        dbSubnetGroup: accountConfig.rds_subnet_group,
        postgresVersion,
        dbPort: POSTGRES_PORT,
        storageType: serviceParams.storage_type || 'standard',
        dbSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId,
        parameterGroupFamily: getParameterGroupFamily(postgresVersion),
        tags: deployPhaseCommon.getTags(ownServiceContext)
    };

    // Add parameters to parameter group if specified
    if (serviceParams.db_parameters) {
        handlebarsParams.parameterGroupParams = serviceParams.db_parameters;
    }

    // Set multiAZ if user-specified
    if (serviceParams.multi_az) {
        handlebarsParams.multi_az = true;
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/postgresql-template.yml`, handlebarsParams);
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<PostgreSQLConfig>,
                      dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors = [];
    const serviceParams = serviceContext.params;

    if (!serviceParams.database_name) {
        errors.push(`${SERVICE_NAME} - The 'database_name' parameter is required`);
    }
    if (!serviceParams.postgres_version) {
        errors.push(`${SERVICE_NAME} - The 'postgres_version' parameter is required`);
    }

    return errors;
}

export function preDeploy(serviceContext: ServiceContext<PostgreSQLConfig>): Promise<PreDeployContext> {
    return preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, POSTGRES_PORT, SERVICE_NAME);
}

export function bind(ownServiceContext: ServiceContext<PostgreSQLConfig>,
                     ownPreDeployContext: PreDeployContext,
                     dependentOfServiceContext: ServiceContext<ServiceConfig>,
                     dependentOfPreDeployContext: PreDeployContext): Promise<BindContext> {
    return bindPhaseCommon.bindDependentSecurityGroupToSelf(ownServiceContext,
        ownPreDeployContext,
        dependentOfServiceContext,
        dependentOfPreDeployContext,
        POSTGRES_PROTOCOL,
        POSTGRES_PORT,
        SERVICE_NAME);
}

export async function deploy(ownServiceContext: ServiceContext<PostgreSQLConfig>,
                             ownPreDeployContext: PreDeployContext,
                             dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying database '${stackName}'`);

    const stack = await cloudFormationCalls.getStack(stackName);
    if (!stack) {
        const dbUsername = rdsDeployersCommon.getNewDbUsername();
        const dbPassword = rdsDeployersCommon.getNewDbPassword();
        const compiledTemplate = await getCompiledPostgresTemplate(stackName,
                                                                   ownServiceContext,
                                                                   ownPreDeployContext);
        const cfParameters = cloudFormationCalls.getCfStyleStackParameters({
            DBUsername: dbUsername,
            DBPassword: dbPassword
        });
        const stackTags = deployPhaseCommon.getTags(ownServiceContext);
        winston.debug(`${SERVICE_NAME} - Creating CloudFormation stack '${stackName}'`);
        const deployedStack = await cloudFormationCalls.createStack(stackName,
                                                                    compiledTemplate,
                                                                    cfParameters,
                                                                    stackTags);
        winston.debug(`${SERVICE_NAME} - Finished creating CloudFormation stack '${stackName}'`);
        await rdsDeployersCommon.addDbCredentialToParameterStore(ownServiceContext,
                                                                 dbUsername,
                                                                 dbPassword,
                                                                 deployedStack);
        winston.info(`${SERVICE_NAME} - Finished deploying database '${stackName}'`);
        return rdsDeployersCommon.getDeployContext(ownServiceContext, deployedStack);
    }
    else {
        winston.info(`${SERVICE_NAME} - Updates are not supported for this service.`);
        return rdsDeployersCommon.getDeployContext(ownServiceContext, stack);
    }
}

export function unPreDeploy(ownServiceContext: ServiceContext<PostgreSQLConfig>): Promise<UnPreDeployContext> {
    return deletePhasesCommon.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

export function unBind(ownServiceContext: ServiceContext<PostgreSQLConfig>): Promise<UnBindContext> {
    return deletePhasesCommon.unBindSecurityGroups(ownServiceContext, SERVICE_NAME);
}

export async function unDeploy(ownServiceContext: ServiceContext<PostgreSQLConfig>): Promise<UnDeployContext> {
    const unDeployContext = await deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
    return rdsDeployersCommon.deleteParametersFromParameterStore(ownServiceContext, unDeployContext);
}

export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = [
    'environmentVariables',
    'securityGroups'
];

export const consumedDeployOutputTypes = [];