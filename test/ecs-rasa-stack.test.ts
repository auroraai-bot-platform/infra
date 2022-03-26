import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import { EcsRasaStack } from '../lib/ecs-rasa-stack';
import { EcsBfStack } from '../lib/ecs-bf-stack';
import { EcsBaseStack } from '../lib/ecs-base-stack';
import { RasaBot } from '../types';
import { defaultRepositories, softwareVersions } from './fixtures';

const envName = 'test';
const subDomain = 'test';
const domain = 'test.test';
const region = 'test';
const account = '0123456789';
const actionsTag = 'latest';
const rasaTag = 'latest';
const botfrontAdminEmail = 'test@test.fi';
const projectCreationVersion = '0.0.1';
const sourceBucketName = 'test';

let ecrRepos: RasaBot[] = [{rasaPort: 1, actionsPort: 2, projectId: 'veryrealid', customerName: 'veryrealcustomer', projectName: 'veryrealcustomer'}];


test('Create rasa-stack with one bot', () => {
  const app = new cdk.App();
  // WHEN
  const basestack = new EcsBaseStack(app, 'MyBaseStack', {
    envName,
    subDomain,
    ecrRepos,
    domain,
    env: {
      region,
      account
    },
    defaultRepositories,
    actionsTag
  });
  const bfstack = new EcsBfStack(app, 'MyBfStack', {
    defaultRepositories,
    envName,
    domain,
    env: {
      region,
      account
    },
    baseCertificate: basestack.baseCertificate,
    baseCluster: basestack.baseCluster,
    baseLoadbalancer: basestack.baseLoadBalancer,
    baseVpc: basestack.baseVpc,
    botfrontVersion: softwareVersions.botfront,
    botfrontAdminEmail,
    projectCreationVersion,
    rasaBots: ecrRepos,
    sourceBucketName
  });
  const teststack = new EcsRasaStack(app, 'MyTestStack', {
    defaultRepositories,
    envName,
    env: {
      region,
      account
    },
    baseCertificate: basestack.baseCertificate,
    baseCluster: basestack.baseCluster,
    baseLoadbalancer: basestack.baseLoadBalancer,
    baseVpc: basestack.baseVpc,
    botfrontService: bfstack.botfrontService,
    rasaBots: ecrRepos,
    actionsVersion: actionsTag,
    rasaVersion: rasaTag
  });
  // THEN
  const template = Template.fromStack(teststack);
  template.resourceCountIs('AWS::ECS::TaskDefinition', 2);
  template.resourceCountIs('AWS::IAM::Role', 4);
  template.resourceCountIs('AWS::Logs::LogGroup', 2);
  template.resourceCountIs('AWS::IAM::Policy', 2);
  template.resourceCountIs('AWS::ECS::Service', 2);
  template.resourceCountIs('AWS::ServiceDiscovery::Service', 2);
  template.resourceCountIs('AWS::EC2::SecurityGroup', 2);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 2);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 2);
});

test('Create rasa-stack with two bots', () => {
  const app = new cdk.App();
  ecrRepos = [
    {rasaPort: 1, actionsPort: 2, projectId: 'veryrealid', customerName: 'veryrealcustomer', projectName: 'veryrealcustomer'},
    {rasaPort: 3, actionsPort: 4, projectId: 'veryrealid2', customerName: 'veryrealcustomer2', projectName: 'veryrealcustomer2'}
  ];

  // WHEN
  const basestack = new EcsBaseStack(app, 'MyBaseStack', {
    envName,
    subDomain,
    ecrRepos,
    domain,
    env: {
      region,
      account
    },
    defaultRepositories,
    actionsTag
  });
  const bfstack = new EcsBfStack(app, 'MyBfStack', {
    defaultRepositories,
    envName,
    domain,
    env: {
      region,
      account
    },
    baseCertificate: basestack.baseCertificate,
    baseCluster: basestack.baseCluster,
    baseLoadbalancer: basestack.baseLoadBalancer,
    baseVpc: basestack.baseVpc,
    botfrontVersion: softwareVersions.botfront,
    botfrontAdminEmail,
    projectCreationVersion,
    rasaBots: ecrRepos,
    sourceBucketName
  });
  const teststack = new EcsRasaStack(app, 'MyTestStack', {
    defaultRepositories,
    envName,
    env: {
      region,
      account
    },
    baseCertificate: basestack.baseCertificate,
    baseCluster: basestack.baseCluster,
    baseLoadbalancer: basestack.baseLoadBalancer,
    baseVpc: basestack.baseVpc,
    botfrontService: bfstack.botfrontService,
    rasaBots: ecrRepos,
    actionsVersion: actionsTag,
    rasaVersion: rasaTag
  });
  // THEN
  const template = Template.fromStack(teststack);
  template.resourceCountIs('AWS::ECS::TaskDefinition', 4);
  template.resourceCountIs('AWS::IAM::Role', 8);
  template.resourceCountIs('AWS::Logs::LogGroup', 4);
  template.resourceCountIs('AWS::IAM::Policy', 4);
  template.resourceCountIs('AWS::ECS::Service', 4);
  template.resourceCountIs('AWS::ServiceDiscovery::Service', 4);
  template.resourceCountIs('AWS::EC2::SecurityGroup', 4);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 4);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 4);
});