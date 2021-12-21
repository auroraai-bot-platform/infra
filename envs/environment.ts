import * as cdk from '@aws-cdk/core';
import { EcsBaseStack } from '../lib/ecs-base-stack';
import { EcsBfStack } from '../lib/ecs-bf-stack';
import { EcsRasaStack } from '../lib/ecs-rasa-stack';
import { WebChatStack } from '../lib/web-chat-stack';
import { EnvironmentConfiguration } from '../types';


export function createEnvironment(app: cdk.App, config: EnvironmentConfiguration) {
  const allPorts = config.rasaBots.map(bot => [bot.actionsPort, bot.rasaPort]).flat();
  const uniquePortCount: number = new Set(allPorts).size;
  const portCollision = uniquePortCount !== allPorts.length;

  if (portCollision) {
    throw new Error(`Env: ${config.envName}. Cannot create environment because of colliding port configurations. ${JSON.stringify(config.rasaBots)}`);
  }

  // Demo-ecs env
  const ecsBaseStack = new EcsBaseStack(app, `${config.envName}-base-stack`, {
    defaultRepositories: config.defaultRepositories,
    envName: config.envName,
    ecrRepos: config.rasaBots,
    subDomain: config.subDomain,
    domain: config.domain,
    env: config.env,
  });

  cdk.Tags.of(ecsBaseStack).add('environment', config.envName)

  const ecsBfStack = new EcsBfStack(app, `${config.envName}-botfront-stack`, {
    envName: config.envName,
    baseCluster: ecsBaseStack.baseCluster,
    baseCertificate: ecsBaseStack.baseCertificate,
    baseLoadbalancer: ecsBaseStack.baseLoadBalancer,
    baseVpc: ecsBaseStack.baseVpc,
    domain: config.domain,
    env: config.env,
    mongoSecret: ecsBaseStack.mongoSecret,
    graphqlSecret: ecsBaseStack.graphqlSecret,
    botfrontVersion: config.softwareVersions.botfront
  });
  cdk.Tags.of(ecsBfStack).add('environment', config.envName)

  const rasaBotStack = new EcsRasaStack(app, `${config.envName}-rasa-stack`, {
    envName: config.envName,
    baseCluster: ecsBaseStack.baseCluster,
    baseVpc: ecsBaseStack.baseVpc,
    baseLoadbalancer: ecsBaseStack.baseLoadBalancer,
    baseCertificate: ecsBaseStack.baseCertificate,
    botfrontService: ecsBfStack.botfrontService,
    rasaBots: config.rasaBots,
    env: config.env,
    graphqlSecret: ecsBaseStack.graphqlSecret
  });

  cdk.Tags.of(rasaBotStack).add('environment', config.envName);

  const webChatStack = new WebChatStack(app, `${config.envName}-webchat-stack`, {
    envName: config.envName,
    env: config.env,
    rasaBots: config.rasaBots,
    domain: config.domain,
    subDomain: config.subDomain,
    frontendVersion: config.softwareVersions.frontend
  });

  return { ecsBaseStack, EcsBfStack, rasaBotStack };
}
