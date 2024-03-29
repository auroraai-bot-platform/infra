import * as cdk from 'aws-cdk-lib';
import { EcsBaseStack } from '../lib/ecs-base-stack';
import { EcsBfStack } from '../lib/ecs-bf-stack';
import { EcsRasaStack } from '../lib/ecs-rasa-stack';
import { WebChatStack } from '../lib/web-chat-stack';
import { EnvironmentConfiguration } from '../types';

const validProjectNameRegExp = new RegExp('^[a-zA-Z0-9]+$');


export function createEnvironment(app: cdk.App, config: EnvironmentConfiguration) {
  const allPorts = config.rasaBots.map(bot => [bot.rasaPort, bot.rasaPortProd]).flat().filter((port) => port != undefined);
  const uniquePortCount = new Set(allPorts).size;
  const hasPortCollision = uniquePortCount !== allPorts.length;

  if (hasPortCollision) {
    throw new Error(`Env: ${config.envName}. Cannot create environment because of colliding port configurations. ${JSON.stringify(config.rasaBots)}`);
  }

  const allProjectIds = config.rasaBots.map(bot => bot.projectId);
  const unqiueProjectIdCount = new Set(allProjectIds).size;
  const hasProjectIdCollision = unqiueProjectIdCount !== allProjectIds.length;

  if (hasProjectIdCollision) {
    throw new Error(`Env: ${config.envName}. Cannot create environment because of colliding projectId configurations. ${JSON.stringify(config.rasaBots)}`);
  }

  const allProjectNames = config.rasaBots.map(bot => bot.projectId);
  const unqiueProjectNameCount = new Set(allProjectNames).size;
  const hasProjectNameCollision = unqiueProjectNameCount !== allProjectNames.length;

  if (hasProjectNameCollision) {
    throw new Error(`Env: ${config.envName}. Cannot create environment because of colliding projectName configurations. ${JSON.stringify(config.rasaBots)}`);
  }

  const invalidProjectNames = config.rasaBots.filter((bot) => validProjectNameRegExp.test(bot.projectName) === false).map((bot) => bot.projectName);

  if (invalidProjectNames.length > 0) {
    throw new Error(`Env: ${config.envName}. Cannot create environment because of invalid projectNames. ${JSON.stringify(invalidProjectNames)}`);
  }


  const ecsBaseStack = new EcsBaseStack(app, `${config.envName}-base-stack`, {
    defaultRepositories: config.defaultRepositories,
    envName: config.envName,
    ecrRepos: config.rasaBots,
    subDomain: config.subDomain,
    domain: config.domain,
    env: config.env,
    actionsTag: config.softwareVersions.actions
  });

  cdk.Tags.of(ecsBaseStack).add('environment', config.envName)

  const ecsBfStack = new EcsBfStack(app, `${config.envName}-botfront-stack`, {
    defaultRepositories: config.defaultRepositories,
    envName: config.envName,
    baseCluster: ecsBaseStack.baseCluster,
    baseCertificate: ecsBaseStack.baseCertificate,
    baseLoadbalancer: ecsBaseStack.baseLoadBalancer,
    baseVpc: ecsBaseStack.baseVpc,
    domain: config.domain,
    env: config.env,
    botfrontVersion: config.softwareVersions.botfront,
    projectCreationVersion: config.softwareVersions.projectCreation,
    sourceBucketName: config.sourceBucketName,
    rasaBots: config.rasaBots,
    botfrontAdminEmail: config.botfrontAdminEmail
  });
  cdk.Tags.of(ecsBfStack).add('environment', config.envName)

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
    rasaVersion: config.softwareVersions.rasa,
    actionsVersion: config.softwareVersions.actions
  });
  cdk.Tags.of(rasaBotStack).add('environment', config.envName);

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
