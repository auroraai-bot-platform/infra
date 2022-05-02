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
  frontend: '0.0.9',
  botfront: '3a68edaef3f29f3202efe0edce23bf59fdaaec1b',
  rasa: '3.0.5',
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
    language: 'en'
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
  },
  {
    rasaPort: 5013,
    actionsPort: 5063,
    projectId: 'j5nFh8Rhr2jZkQHcg',
    customerName: 'kuhr',
    projectName: 'kuhr'
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
  frontend: '0.0.9',
  botfront: '3a68edaef3f29f3202efe0edce23bf59fdaaec1b',
  rasa: '3.0.5',
  actions: 'test-recommender-2',
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
    projectName: 'palmu'
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
