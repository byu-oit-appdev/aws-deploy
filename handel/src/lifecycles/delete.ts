/*
 * Copyright 2018 Brigham Young University
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
import { AccountConfig, ServiceRegistry } from 'handel-extension-api';
import * as winston from 'winston';
import * as util from '../common/util';
import {
    DeleteOptions,
    DeployOrder,
    EnvironmentContext,
    EnvironmentDeleteResult,
    HandelFile,
    HandelFileParser,
    PreDeployContexts,
    UnBindContexts,
    UnDeployContexts
} from '../datatypes';
import * as deployOrderCalc from '../deploy/deploy-order-calc';
import * as preDeployPhase from '../phases/pre-deploy';
import * as unBindPhase from '../phases/un-bind';
import * as unDeployPhase from '../phases/un-deploy';
import * as unPreDeployPhase from '../phases/un-pre-deploy';

async function unDeployAndUnBindServices(serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext, preDeployContexts: PreDeployContexts, deployOrder: DeployOrder) {
    const unBindContexts: UnBindContexts = {};
    const unDeployContexts: UnDeployContexts = {};
    for (let currentLevel = deployOrder.length - 1; deployOrder[currentLevel]; currentLevel--) {
        // Un-deploy all services in the current level
        const levelUnDeployResults = await unDeployPhase.unDeployServicesInLevel(serviceRegistry, environmentContext, deployOrder, currentLevel);
        for (const serviceName in levelUnDeployResults) {
            if (levelUnDeployResults.hasOwnProperty(serviceName)) {
                unDeployContexts[serviceName] = levelUnDeployResults[serviceName];
            }
        }

        // Un-bind all services in the current level
        const levelUnBindResults = await unBindPhase.unBindServicesInLevel(serviceRegistry, environmentContext, preDeployContexts, deployOrder, currentLevel);
        for (const serviceName in levelUnBindResults) {
            if (levelUnBindResults.hasOwnProperty(serviceName)) {
                unBindContexts[serviceName] = levelUnBindResults[serviceName];
            }
        }
    }

    return {
        unBindContexts,
        unDeployContexts
    };
}

async function deleteEnvironment(accountConfig: AccountConfig, serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext): Promise<EnvironmentDeleteResult> {
    const startTime = Date.now();
    if (!accountConfig || !environmentContext) {
        return new EnvironmentDeleteResult(
            !environmentContext ? 'invalid-env' : environmentContext.environmentName,
            startTime, 'failure', 'Invalid configuration');
    }
    else {
        winston.info(`Starting delete for environment ${environmentContext.environmentName}`);

        try {
            // First get PreDeploy information to give to UnBind
            const preDeployResults = await preDeployPhase.getPreDeployContexts(serviceRegistry, environmentContext);

            const deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
            const unDeployAndUnBindResults = await unDeployAndUnBindServices(serviceRegistry, environmentContext, preDeployResults, deployOrder);
            const unPreDeployResults = await unPreDeployPhase.unPreDeployServices(serviceRegistry, environmentContext);
            return new EnvironmentDeleteResult(environmentContext.environmentName, startTime, 'success', 'Success');
        }
        catch (err) {
            return new EnvironmentDeleteResult(environmentContext.environmentName, startTime, 'failure', err.message, err);
        }
    }
}

export async function deleteEnv(accountConfig: AccountConfig, handelFile: HandelFile, environmentToDelete: string, handelFileParser: HandelFileParser, serviceRegistry: ServiceRegistry, options: DeleteOptions): Promise<EnvironmentDeleteResult> {
    // Run the delete on the environment specified
    const environmentContext = util.createEnvironmentContext(handelFile, handelFileParser, environmentToDelete, accountConfig, serviceRegistry, options);
    return deleteEnvironment(accountConfig, serviceRegistry, environmentContext);
}
