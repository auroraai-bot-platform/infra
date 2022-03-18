import { Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Network } from '../lib/network';
import { EnvironmentConfiguration } from '../types';
import { Botfront } from './botfront';
import { Rasa } from './rasa';
import { Webchat } from './webchat';

const validProjectNameRegExp = new RegExp('^[a-zA-Z0-9]+$');

export interface InfraProps extends StackProps  {
  envName: string;
  config: EnvironmentConfiguration;
}

export class InfraStack extends Stack {

  constructor(scope: Construct, id: string, props: InfraProps) {
    super(scope, id, props);
    const allPorts = props.config.rasaBots.map(bot => [bot.rasaPort, bot.rasaPortProd]).flat().filter((port) => port != undefined);
    const uniquePortCount = new Set(allPorts).size;
    const hasPortCollision = uniquePortCount !== allPorts.length;

    if (hasPortCollision) {
      throw new Error(`Env: ${props.config.envName}. Cannot create environment because of colliding port configurations. ${JSON.stringify(props.config.rasaBots)}`);
    }

    const allProjectIds = props.config.rasaBots.map(bot => bot.projectId);
    const unqiueProjectIdCount = new Set(allProjectIds).size;
    const hasProjectIdCollision = unqiueProjectIdCount !== allProjectIds.length;

    if (hasProjectIdCollision) {
      throw new Error(`Env: ${props.config.envName}. Cannot create environment because of colliding projectId configurations. ${JSON.stringify(props.config.rasaBots)}`);
    }

    const allProjectNames = props.config.rasaBots.map(bot => bot.projectId);
    const unqiueProjectNameCount = new Set(allProjectNames).size;
    const hasProjectNameCollision = unqiueProjectNameCount !== allProjectNames.length;

    if (hasProjectNameCollision) {
      throw new Error(`Env: ${props.config.envName}. Cannot create environment because of colliding projectName configurations. ${JSON.stringify(props.config.rasaBots)}`);
    }

    const invalidProjectNames = props.config.rasaBots.filter((bot) => validProjectNameRegExp.test(bot.projectName) === false).map((bot) => bot.projectName);

    if (invalidProjectNames.length > 0) {
      throw new Error(`Env: ${props.config.envName}. Cannot create environment because of invalid projectNames. ${JSON.stringify(invalidProjectNames)}`);
    }

    const network = new Network(this, `${props.config.envName}-network`, {
      defaultRepositories: props.config.defaultRepositories,
      envName: props.config.envName,
      ecrRepos: props.config.rasaBots,
      subDomain: props.config.subDomain,
      domain: props.config.domain,
      actionsTag: props.config.softwareVersions.actions
    });

    const botfront = new Botfront(this, `${props.config.envName}-botfront`, {
      defaultRepositories: props.config.defaultRepositories,
      envName: props.config.envName,
      baseCluster: network.baseCluster,
      baseCertificate: network.baseCertificate,
      baseLoadbalancer: network.baseLoadBalancer,
      baseVpc: network.baseVpc,
      domain: props.config.domain,
      mongoSecret: network.mongoSecret,
      graphqlSecret: network.graphqlSecret,
      botfrontVersion: props.config.softwareVersions.botfront,
      projectCreationVersion: props.config.softwareVersions.projectCreation,
      sourceBucketName: props.config.sourceBucketName,
      rasaBots: props.config.rasaBots,
      botfrontAdminEmail: props.config.botfrontAdminEmail
    });

    new Rasa(this, `${props.config.envName}-rasa`, {
      defaultRepositories: props.config.defaultRepositories,
      envName: props.config.envName,
      baseCluster: network.baseCluster,
      baseVpc: network.baseVpc,
      baseLoadbalancer: network.baseLoadBalancer,
      baseCertificate: network.baseCertificate,
      botfrontService: botfront.botfrontService,
      rasaBots: props.config.rasaBots,
      graphqlSecret: network.graphqlSecret,
      rasaVersion: props.config.softwareVersions.rasa,
      actionsVersion: props.config.softwareVersions.actions
    });

    new Webchat(this, `${props.config.envName}-webchat`, {
      envName: props.config.envName,
      rasaBots: props.config.rasaBots,
      domain: props.config.domain,
      subDomain: props.config.subDomain,
      frontendVersion: props.config.softwareVersions.frontend,
      sourceBucketName: props.config.sourceBucketName
    });
  }
}
