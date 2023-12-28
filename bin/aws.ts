import { App } from 'aws-cdk-lib';
import { DefaultRepositories, RasaBot, SoftwareVersions } from '../types';
import { createEnvironment } from '../envs/environment';

const region = process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION || 'eu-north-1';
const account = process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT || '';

const sourceBucketName = 'auroraai-source-code-bucket';
const botfrontAdminEmail = 'admin@aaibot.link';

const app = new App();

console.log({account});

// ECR repositories
const defaultRepositories: DefaultRepositories = {
  actionsRepository: 'actions-private',
  botfrontRepository: 'botfront-private',
  rasaBotRepository: 'rasa-private',
};

const customerSoftwareVersions: SoftwareVersions = {
  frontend: '0.6.6',
  botfront: '6c3af2e784f43689ab4e21c750d91b8999cafd66ba07a29d6152680f9d9f5d31',
  rasa: '9c692b7d3e17fcdcd93db8b919aa8aec6f8c5932',
  actions: 'test-recommender-2',
  projectCreation: '1.0.0'
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
    projectName: 'hytebotti',
    disabled: true,
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
    projectName: 'ihtbotti',
    disabled: true,
    language: 'en'
  },
  {
    rasaPort: 5009,
    actionsPort: 5059,
    projectId: '5N9KN36CprezbZiND',
    customerName: 'kupotti',
    projectName: 'kupotti',
    disabled: true
  },
  {
    rasaPort: 5010,
    actionsPort: 5060,
    projectId: 'RdZ2sZtx5DXp6r6Ja',
    customerName: 'kukibotti',
    projectName: 'kukibotti',
    disabled: true
  },
  {
    rasaPort: 5011,
    actionsPort: 5061,
    projectId: 'RE6gaLdvsMxGwKAcA',
    customerName: 'hdl-botti',
    projectName: 'hdlbotti',
    disabled: true
  },
  {
    rasaPort: 5012,
    actionsPort: 5062,
    projectId: 'Tyofez6zTQDxxSFZT',
    customerName: 'albotti',
    projectName: 'albotti',
    disabled: true
  },
  {
    rasaPort: 5013,
    actionsPort: 5063,
    projectId: 'j5nFh8Rhr2jZkQHcg',
    customerName: 'kuhr',
    projectName: 'kuhr',
    disabled: true
  },
  {
    rasaPort: 5014,
    rasaPortProd: 10014,
    actionsPort: 5064,
    actionsPortProd: 10064,
    projectId: '5b5Ja1MhY2o9NLjjr',
    customerName: 'pohabotti',
    projectName: 'pohabotti',
    hasProd: true
  }
];

const customerenv = createEnvironment(app, {
  domain,
  defaultRepositories,
  env: {account, region},
  envName: customerEnvName,
  rasaBots: customerRasaBots,
  subDomain: customerSubDomain,
  softwareVersions: customerSoftwareVersions,
  sourceBucketName,
  botfrontAdminEmail
});

// Demo environment
const demoEnvName = 'demo';
const demoSubDomain = `${demoEnvName}.${domain}`;

const demoSoftwareVersions: SoftwareVersions = {
  frontend: 'latest',
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
    rasaLoadModels: true,
    projectName: 'testbot'
  },
  {
    rasaPort: 5009,
    actionsPort: 5059,
    projectId: 'palmu',
    customerName: 'palmu',
    projectName: 'palmu',
    rasaLoadModels: true
  }
];

const demoenv = createEnvironment(app, {
  domain,
  defaultRepositories,
  env: {account, region},
  envName: demoEnvName,
  rasaBots: demoRasaBots,
  subDomain: demoSubDomain,
  softwareVersions: demoSoftwareVersions,
  sourceBucketName,
  botfrontAdminEmail
});

// HDL environment

const hdlSoftwareVersions: SoftwareVersions = {
  frontend: '0.0.14',
  botfront: 'c0b01a7effc3f19079c03e77459dbf784e86cd08',
  rasa: '9c692b7d3e17fcdcd93db8b919aa8aec6f8c5932',
  actions: 'test-recommender-2',
  projectCreation: '1.0.0'
};

const hdlRasaBots: RasaBot[] = [
  {
    rasaPort: 5011,
    actionsPort: 5061,
    projectId: 'RE6gaLdvsMxGwKAcA',
    customerName: 'hdl-botti',
    projectName: 'hdlbotti',
  },
];

const hdlenv = createEnvironment(app, {
  domain: "hdlbotti.link",
  defaultRepositories,
  env: {
    account: "367307615819",
    region: "eu-north-1"
  },
  envName: "hdl",
  rasaBots: hdlRasaBots,
  subDomain: "hdl.hdlbotti.link",
  softwareVersions: hdlSoftwareVersions,
  sourceBucketName: "auroraai-source-code-bucket-367307615819-eu-north-1",
  botfrontAdminEmail: "admin@hdlbotti.link",
});
