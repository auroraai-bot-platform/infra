import { App, Tags } from 'aws-cdk-lib';
import { RasaBot, SoftwareVersions } from '../types';
import { InfraStack } from '../lib/infra-stack';
import { EnvironmentConfiguration } from '../types';
import { defaultRepositories, domain } from '../lib/common';

const region = process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION || 'eu-north-1';
const account = process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT || '';

const sourceBucketName = 'auroraai-source-code-bucket';
const botfrontAdminEmail = 'admin@aaibot.link';

const app = new App();

console.log({account});

// Demo environment
let envName = 'demo';
let subDomain = `${envName}.${domain}`;

const demoSoftwareVersions: SoftwareVersions = {
  frontend: '0.0.7',
  botfront: '3.0.9',
  rasa: '3.0.2',
  actions: '2.8.3-hyte',
  projectCreation: '1.0.0'
};

const demoRasaBots: RasaBot[] = [
  {
    rasaPort: 5008,
    rasaPortProd: 10008,
    actionsPort: 5058,
    actionsPortProd: 10058,
    projectId: 'testbot',
    customerName: 'testbot',
    hasProd: true,
    projectName: 'testbot'
  },
  {
    rasaPort: 5009,
    actionsPort: 5059,
    projectId: 'palmu',
    customerName: 'palmu',
    projectName: 'palmu'
  }
];

let config: EnvironmentConfiguration = {
  domain,
  defaultRepositories,
  env: {account, region},
  envName,
  rasaBots: demoRasaBots,
  subDomain,
  softwareVersions: demoSoftwareVersions,
  sourceBucketName,
  botfrontAdminEmail
}

const demoStack = new InfraStack(app, `demo-stack`, {
  env: {
    region,
    account
  },
  envName,
  config
});
Tags.of(demoStack).add('environment', envName);

const customerSoftwareVersions: SoftwareVersions = {
  frontend: '0.0.7',
  botfront: '3.0.9',
  rasa: '3.0.2',
  actions: '2.1.2-hyte',
  projectCreation: '1.0.0'
};

// Customer environment
envName = 'customer';
subDomain = `${envName}.${domain}`;

const customerRasaBots: RasaBot[] = [
  {
    rasaPort: 5005, 
    actionsPort: 5055, 
    projectId: 'HFqcqN9LEiDo8u2N7', 
    customerName: 'hyte-firstbot',
    projectName: 'hytebotti',
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
    customerName: 'iht-botti',
    projectName: 'ihtbotti'
  },
  {
    rasaPort: 5009,
    actionsPort: 5059,
    projectId: '5N9KN36CprezbZiND',
    customerName: 'kupotti',
    projectName: 'kupotti'
  },
  {
    rasaPort: 5010,
    actionsPort: 5060,
    projectId: 'RdZ2sZtx5DXp6r6Ja',
    customerName: 'kukibotti',
    projectName: 'kukibotti'
  },
  {
    rasaPort: 5011,
    actionsPort: 5061,
    projectId: 'RE6gaLdvsMxGwKAcA',
    customerName: 'hdl-botti',
    projectName: 'hdlbotti'
  },
  {
    rasaPort: 5012,
    actionsPort: 5062,
    projectId: 'Tyofez6zTQDxxSFZT',
    customerName: 'albotti',
    projectName: 'albotti'
  }
];

config = {
  domain,
  defaultRepositories,
  env: {account, region},
  envName,
  rasaBots: customerRasaBots,
  subDomain,
  softwareVersions: customerSoftwareVersions,
  sourceBucketName,
  botfrontAdminEmail
}

const customerStack = new InfraStack(app, `customer-stack`, {
  env: {
    region,
    account
  },
  envName,
  config
});
Tags.of(customerStack).add('environment', envName);
