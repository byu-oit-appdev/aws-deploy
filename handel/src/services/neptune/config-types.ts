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
import { ServiceConfig, Tags } from 'handel-extension-api';

export interface NeptuneConfig extends ServiceConfig {
    instance_type?: string;
    cluster_size?: number;
    description?: string;
    iam_auth_enabled?: boolean;
    cluster_parameters?: NeptuneDBParameters;
    instance_parameters?: NeptuneDBParameters;
}

export interface NeptuneDBParameters {
    [parameterName: string]: string;
}

export interface HandlebarsNeptuneTemplate {
    description: string;
    parameterGroupFamily: string;
    tags: Tags;
    stackName: string;
    dbSubnetGroup: string;
    port: number;
    dbSecurityGroupId: string;
    instances: HandlebarsInstanceConfig[];
    iamAuthEnabled: boolean;
    clusterParameters?: HandlebarsNeptuneParameterGroupParams;
    instanceParameters?: HandlebarsNeptuneParameterGroupParams;
}

export interface HandlebarsNeptuneParameterGroupParams {
    [key: string]: string;
}

export interface HandlebarsInstanceConfig {
    instanceType: string;
}