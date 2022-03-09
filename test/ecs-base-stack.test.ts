import { Template } from "aws-cdk-lib/assertions";
import * as cdk from 'aws-cdk-lib';
import { EcsBaseStack } from '../lib/ecs-base-stack';
import { RasaBot } from '../types';
import { defaultRepositories } from './fixtures';

const envName = 'test';
const subDomain = 'test';
const domain = 'test.test';
const region = 'test';
const account = '0123456789';
const actionsTag = 'latest';


let ecrRepos: RasaBot[] = [{rasaPort: 1, actionsPort: 2, projectId: 'veryrealid', customerName: 'veryrealcustomer'}];

test('Create base-stack with one bot without snapshot', () => {
  const app = new cdk.App();
  // WHEN
  const teststack = new EcsBaseStack(app, 'MyTestStack', {
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
  // THEN
  const template = Template.fromStack(teststack);
  template.resourceCountIs('AWS::EC2::VPC', 1);
  template.resourceCountIs('AWS::EC2::Subnet', 4);
  template.resourceCountIs('AWS::EC2::RouteTable', 4);
  template.resourceCountIs('AWS::ECR::Repository', 1);
  template.resourceCountIs('AWS::ECS::Cluster', 1);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
  template.resourceCountIs('AWS::Route53::RecordSet', 1);
  template.resourceCountIs('AWS::EC2::VPCEndpoint', 4);
  template.resourceCountIs('AWS::EC2::SecurityGroup', 4);
  template.resourceCountIs('AWS::SecretsManager::Secret', 2);
});

test('Create base-stack with two bots', () => {
  const app = new cdk.App();
  ecrRepos = [
    {rasaPort: 1, actionsPort: 2, projectId: 'veryrealid', customerName: 'veryrealcustomer'},
    {rasaPort: 3, actionsPort: 4, projectId: 'veryrealid2', customerName: 'veryrealcustomer2'}
  ];

  // WHEN
  const teststack = new EcsBaseStack(app, 'MyTestStack', {
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
  // THEN
  const template = Template.fromStack(teststack);
  template.resourceCountIs('AWS::EC2::VPC', 1);
  template.resourceCountIs('AWS::EC2::Subnet', 4);
  template.resourceCountIs('AWS::EC2::RouteTable', 4);
  template.resourceCountIs('AWS::ECR::Repository', 2);
  template.resourceCountIs('AWS::ECS::Cluster', 1);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
  template.resourceCountIs('AWS::Route53::RecordSet', 1);
  template.resourceCountIs('AWS::EC2::VPCEndpoint', 4);
  template.resourceCountIs('AWS::EC2::SecurityGroup', 4);
  template.resourceCountIs('AWS::SecretsManager::Secret', 2);
});