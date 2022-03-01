import { App, Tags } from 'aws-cdk-lib';
import { EcsBaseStack } from '../lib/ecs-base-stack';
import { EcsBfStack } from '../lib/ecs-bf-stack';
import { EcsRasaStack } from '../lib/ecs-rasa-stack';
import { WebChatStack } from '../lib/web-chat-stack';
import { EnvironmentConfiguration } from '../types';

const validProjectNameRegExp = new RegExp('^[a-zA-Z0-9]+$');


export function createEnvironment(app: App, config: EnvironmentConfiguration) {
  const allPorts = config.rasaBots.map(bot => [bot.rasaPort, bot.rasaPortProd]).flat().filter((port) => port != undefined);
  const uniquePortCount = new Set(allPorts).size;
  const portCollision = uniquePortCount !== allPorts.length;

  if (portCollision) {
    throw new Error(`Env: ${config.envName}. Cannot create environment because of colliding port configurations. ${JSON.stringify(config.rasaBots)}`);
  }

  const allProjectIds = config.rasaBots.map(bot => bot.projectId);
  const unqiueProjectIdCount = new Set(allProjectIds).size;
  const projectIdCollision = unqiueProjectIdCount !== allProjectIds.length;

  if (projectIdCollision) {
    throw new Error(`Env: ${config.envName}. Cannot create environment because of colliding projectId configurations. ${JSON.stringify(config.rasaBots)}`);
  }

  const invalidCustomerNames = config.rasaBots.filter((bot) => validProjectNameRegExp.test(bot.customerName) === false).map((bot) => bot.customerName);

  // if (invalidCustomerNames.length > 0) {
  //   throw new Error(`Env: ${config.envName}. Cannot create environment because of invalid customerNames. ${JSON.stringify(invalidCustomerNames)}`);
  // }

  // Demo-ecs env
  const ecsBaseStack = new EcsBaseStack(app, `${config.envName}-base-stack`, {
    defaultRepositories: config.defaultRepositories,
    envName: config.envName,
    ecrRepos: config.rasaBots,
    subDomain: config.subDomain,
    domain: config.domain,
    env: config.env,
    actionsTag: config.softwareVersions.actions
  });

  Tags.of(ecsBaseStack).add('environment', config.envName)

  const ecsBfStack = new EcsBfStack(app, `${config.envName}-botfront-stack`, {
    defaultRepositories: config.defaultRepositories,
    envName: config.envName,
    baseCluster: ecsBaseStack.baseCluster,
    baseCertificate: ecsBaseStack.baseCertificate,
    baseLoadbalancer: ecsBaseStack.baseLoadBalancer,
    baseVpc: ecsBaseStack.baseVpc,
    domain: config.domain,
    env: config.env,
    mongoSecret: ecsBaseStack.mongoSecret,
    graphqlSecret: ecsBaseStack.graphqlSecret,
    botfrontVersion: config.softwareVersions.botfront,
    projectCreationVersion: config.softwareVersions.projectCreation,
    sourceBucketName: config.sourceBucketName,
    rasaBots: config.rasaBots,
    botfrontAdminEmail: config.botfrontAdminEmail,
  });
  Tags.of(ecsBfStack).add('environment', config.envName)

  const rasaBotStack = new EcsRasaStack(app, `${config.envName}-rasa-stack`, {
    defaultRepositories: config.defaultRepositories,
    envName: config.envName,
    baseCluster: ecsBaseStack.baseCluster,
    baseVpc: ecsBaseStack.baseVpc,
    baseLoadbalancer: ecsBaseStack.baseLoadBalancer,
    baseCertificate: ecsBaseStack.baseCertificate,
    botfrontService: ecsBfStack.botfrontService,
    rasaBots: config.rasaBots,
    env: config.env,
    graphqlSecret: ecsBaseStack.graphqlSecret,
    rasaVersion: config.softwareVersions.rasa,
    actionsVersion: config.softwareVersions.actions
  });

  Tags.of(rasaBotStack).add('environment', config.envName);

  const webChatStack = new WebChatStack(app, `${config.envName}-webchat-stack`, {
    envName: config.envName,
    env: config.env,
    rasaBots: config.rasaBots,
    domain: config.domain,
    subDomain: config.subDomain,
    frontendVersion: config.softwareVersions.frontend,
    sourceBucketName: config.sourceBucketName
  });

  return { ecsBaseStack, EcsBfStack, rasaBotStack };
}
