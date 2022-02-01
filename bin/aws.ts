#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { DefaultRepositories, RasaBot, SoftwareVersions } from '../types';
import { createEnvironment } from '../envs/environment';

const region = process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION || 'eu-north-1';
const account = process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT || '';

const app = new cdk.App();

console.log({account});

// ECR repositories
const defaultRepositories: DefaultRepositories = {
  actionsRepository: 'actions-private',
  botfrontRepository: 'botfront-private',
  rasaBotRepository: 'rasa-private',
};

let softwareVersions: SoftwareVersions = {
  frontend: '0.0.7',
  botfront: '1.0.5-alpine-meteor-2.3.6',
  rasa: '2.3.3',
  actions: '2.1.2-hyte'
};

// Base domain
const domain = 'aaibot.link';

// Environments
// RasaBots customerName must be unique!

// Customer environment
const customerEnvName = 'customer';
const customerSubDomain = `${customerEnvName}.${domain}`;

const customerRasaBots: RasaBot[] = [
  {
    rasaPort: 5005, 
    actionsPort: 5055, 
    projectId: 'HFqcqN9LEiDo8u2N7', 
    customerName: 'hyte-firstbot', 
    additionalConfig: {
      intents: {
        onerva: '/aloita{"oma_organisaatio": "onerva"}',
        vamos: '/aloita{"oma_organisaatio": "vamos"}',
        helsinkimissio: '/aloita{"oma_organisaatio": "helsinki missio"}',
        poikienpuhelin: '/aloita{"oma_organisaatio": "poikien puhelin"}',
        asemanlapset: '/aloita{"oma_organisaatio": "aseman lapset"}'
      }
    }
  },
  {
    rasaPort: 5008,
    actionsPort: 5058,
    projectId: '5pdZnBudb8vgahE5X',
    customerName: 'iht-botti'
  },
  {
    rasaPort: 5009,
    actionsPort: 5059,
    projectId: '5N9KN36CprezbZiND',
    customerName: 'kupotti'
  }
];

const customerenv = createEnvironment(app, {
  domain,
  defaultRepositories,
  env: {account, region},
  envName: customerEnvName,
  rasaBots: customerRasaBots,
  subDomain: customerSubDomain,
  softwareVersions
});

// Demo environment
const demoEnvName = 'demo';
const demoSubDomain = `${demoEnvName}.${domain}`;

softwareVersions = {
  frontend: '0.0.7',
  botfront: '3.0.1',
  rasa: '3.0.2',
  actions: '2.8.3-hyte'
};

const demoRasaBots: RasaBot[] = [
  {
    rasaPort: 5006,
    rasaPortProd: 10006,
    actionsPort: 5055,
    projectId: 'hH4Z8S7GXiHsp3PTP',
    customerName: 'demo-1'
  },
  {
    rasaPort: 5007,
    actionsPort: 5057,
    projectId: 'C6y53duQKrDhBqFRp',
    customerName: 'palmu-demo'
  }
];

const demoenv = createEnvironment(app, {
  domain,
  defaultRepositories,
  env: {account, region},
  envName: demoEnvName,
  rasaBots: demoRasaBots,
  subDomain: demoSubDomain,
  softwareVersions
});
