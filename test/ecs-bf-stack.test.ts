import {countResources, expect as expect }from '@aws-cdk/assert';
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
const sourceBucketName = 'notarealbucket';


let ecrRepos: RasaBot[] = [{rasaPort: 1, actionsPort: 2, projectId: 'veryrealid', customerName: 'veryrealcustomer'}];


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
    mongoSecret: basestack.mongoSecret,
    graphqlSecret: basestack.graphqlSecret,
    botfrontVersion: softwareVersions.botfront,
    botfrontAdminEmail,
    projectCreationVersion,
    rasaBots: ecrRepos,
    sourceBucketName
  });
  // THEN
  expect(teststack).to(countResources('AWS::ECS::TaskDefinition', 1)
  .and(countResources('AWS::IAM::Role', 5))
  .and(countResources('AWS::IAM::Policy', 5))
  .and(countResources('AWS::ECS::Service', 1))
  .and(countResources('AWS::ServiceDiscovery::Service', 1))
  .and(countResources('AWS::EC2::SecurityGroup', 2))
  .and(countResources('AWS::ElasticLoadBalancingV2::Listener', 1))
  .and(countResources('AWS::ElasticLoadBalancingV2::TargetGroup', 1))
  );
});

test('Create botfront-stack with two bots', () => {
    const app = new cdk.App();
    ecrRepos = [
      {rasaPort: 1, actionsPort: 2, projectId: 'veryrealid', customerName: 'veryrealcustomer'},
      {rasaPort: 3, actionsPort: 4, projectId: 'veryrealid2', customerName: 'veryrealcustomer2'}
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
      mongoSecret: basestack.mongoSecret,
      graphqlSecret: basestack.graphqlSecret,
      botfrontVersion: softwareVersions.botfront,
      botfrontAdminEmail,
      projectCreationVersion,
      rasaBots: ecrRepos,
      sourceBucketName
    });
    // THEN
    expect(teststack).to(countResources('AWS::ECS::TaskDefinition', 1)
    .and(countResources('AWS::IAM::Role', 5))
    .and(countResources('AWS::IAM::Policy', 5))
    .and(countResources('AWS::ECS::Service', 1))
    .and(countResources('AWS::ServiceDiscovery::Service', 1))
    .and(countResources('AWS::EC2::SecurityGroup', 2))
    .and(countResources('AWS::ElasticLoadBalancingV2::Listener', 1))
    .and(countResources('AWS::ElasticLoadBalancingV2::TargetGroup', 1))
    );
});