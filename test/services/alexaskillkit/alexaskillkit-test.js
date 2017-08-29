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
const alexaSkillKit = require('../../../lib/services/alexaskillkit');
const ProduceEventsContext = require('../../../lib/datatypes/produce-events-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const ServiceContext = require('../../../lib/datatypes/service-context');
const sinon = require('sinon');
const expect = require('chai').expect;

const accountConfig = require('../../../lib/common/account-config')(`${__dirname}/../../test-account-config.yml`);

describe('alexaskillkit deployer', function () {
    let sandbox;
    let serviceContext;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
        serviceContext = new ServiceContext("Fakepp", "FakeEnv", "FakeService", "alexaskillkit", "1", {}, accountConfig);
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should return no errors', function() {
            let errors = alexaSkillKit.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('deploy', function () {
        it('should return an empty deploy context', function () {
            return alexaSkillKit.deploy({}, {}, {})
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                });
        });
    });

    describe('produceEvents', function () {
        it('should return an empty produceEvents context', function () {
            return alexaSkillKit.produceEvents({}, {}, {})
                .then(produceEventsContext => {
                    expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
                });
        });
    });
});