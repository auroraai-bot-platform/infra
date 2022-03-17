import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
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
const botfrontAdminEmail = 'test@test.fi';
const projectCreationVersion = '0.0.1';
const sourceBucketName = 'test';

let ecrRepos: RasaBot[] = [{rasaPort: 1, actionsPort: 2, projectId: 'veryrealid', customerName: 'veryrealcustomer', projectName: 'veryrealcustomer'}];


test('Create botfront-stack with one bot', () => {
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
  const teststack = new EcsBfStack(app, 'MyTestStack', {
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
    sourceBucketName,
    rasaBots: ecrRepos,
    graphqlSecret: basestack.graphqlSecret,
    mongoSecret: basestack.mongoSecret
  });
  // THEN
  const template = Template.fromStack(teststack);
  template.resourceCountIs('AWS::ECS::TaskDefinition', 1);
  template.resourceCountIs('AWS::IAM::Role', 5);
  template.resourceCountIs('AWS::IAM::Policy', 5);
  template.resourceCountIs('AWS::ECS::Service', 1);
  template.resourceCountIs('AWS::ServiceDiscovery::Service', 1);
  template.resourceCountIs('AWS::EC2::SecurityGroup', 2);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 1);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 1);
  template.resourceCountIs('AWS::SecretsManager::Secret', 1);
});

test('Create botfront-stack with two bots', () => {
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
    const teststack = new EcsBfStack(app, 'MyTestStack', {
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
      sourceBucketName,
      rasaBots: ecrRepos,
      graphqlSecret: basestack.graphqlSecret,
      mongoSecret: basestack.mongoSecret
    });
    // THEN
    const template = Template.fromStack(teststack);
    template.resourceCountIs('AWS::ECS::TaskDefinition', 1);
    template.resourceCountIs('AWS::IAM::Role', 5);
    template.resourceCountIs('AWS::IAM::Policy', 5);
    template.resourceCountIs('AWS::ECS::Service', 1);
    template.resourceCountIs('AWS::ServiceDiscovery::Service', 1);
    template.resourceCountIs('AWS::EC2::SecurityGroup', 2);
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 1);
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 1);
    template.resourceCountIs('AWS::SecretsManager::Secret', 1);
});