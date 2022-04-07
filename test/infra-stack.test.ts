import { Template } from 'aws-cdk-lib/assertions';
import { App } from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack';
import { EnvironmentConfiguration } from '../types';
import { defaultRepositories, softwareVersions } from './fixtures';

let config: EnvironmentConfiguration = {
  botfrontAdminEmail: 'test@test.fi',
  defaultRepositories,
  domain: 'test',
  env: {
    account: '123456789',
    region: 'test'
  },
  envName: 'test',
  rasaBots: [{rasaPort: 1, actionsPort: 2, projectId: 'veryrealid', customerName: 'veryrealcustomer', projectName: 'veryrealcustomer', hasProd: false}],
  softwareVersions,
  sourceBucketName: 'test',
  subDomain: 'test',
  ports: {
    botfrontPort: 8888,
    ducklingPort: 8000,
    restApiPort: 3030
  }
};

test('Create infra with one bot', () => {
  const app = new App();
  // WHEN
  const teststack = new InfraStack(app, 'MyTestStack', {
    config,
    env: {
      account: config.env.account,
      region: config.env.region
    },
    envName: config.envName
  });
  // THEN
  const template = Template.fromStack(teststack);
  template.resourceCountIs('AWS::EC2::VPC', 1);
  template.resourceCountIs('AWS::EC2::Subnet', 4);
  template.resourceCountIs('AWS::EC2::RouteTable', 4);
  template.resourceCountIs('AWS::ECR::Repository', 1);
  template.resourceCountIs('AWS::ECS::Cluster', 1);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
  template.resourceCountIs('AWS::Route53::RecordSet', 2);
  template.resourceCountIs('AWS::EC2::VPCEndpoint', 5);
  template.resourceCountIs('AWS::EC2::SecurityGroup', 10);
  template.resourceCountIs('AWS::SecretsManager::Secret', 1);
  template.resourceCountIs('AWS::ECS::TaskDefinition', 4);
  template.resourceCountIs('AWS::IAM::Role', 15);
  template.resourceCountIs('AWS::Logs::LogGroup', 4);
  template.resourceCountIs('AWS::IAM::Policy', 11);
  template.resourceCountIs('AWS::ECS::Service', 4);
  template.resourceCountIs('AWS::ServiceDiscovery::Service', 4);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 3);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 4);
});

test('Create infra with two bots', () => {
  const app = new App();
  config.rasaBots =  [
    {rasaPort: 1, actionsPort: 2, projectId: 'veryrealid', customerName: 'veryrealcustomer', projectName: 'veryrealcustomer', hasProd: false},
    {rasaPort: 3, actionsPort: 4, projectId: 'veryrealid2', customerName: 'veryrealcustomer2', projectName: 'veryrealcustomer2', hasProd: false}
  ];

  // WHEN
  const teststack = new InfraStack(app, 'MyTestStack', {
    config,
    env: {
      account: config.env.account,
      region: config.env.region
    },
    envName: config.envName
  });
  // THEN
  const template = Template.fromStack(teststack);
  template.resourceCountIs('AWS::EC2::VPC', 1);
  template.resourceCountIs('AWS::EC2::Subnet', 4);
  template.resourceCountIs('AWS::EC2::RouteTable', 4);
  template.resourceCountIs('AWS::ECR::Repository', 2);
  template.resourceCountIs('AWS::ECS::Cluster', 1);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
  template.resourceCountIs('AWS::Route53::RecordSet', 3);
  template.resourceCountIs('AWS::EC2::VPCEndpoint', 5);
  template.resourceCountIs('AWS::EC2::SecurityGroup', 12);
  template.resourceCountIs('AWS::SecretsManager::Secret', 1);
  template.resourceCountIs('AWS::ECS::TaskDefinition', 6);
  template.resourceCountIs('AWS::IAM::Role', 20);
  template.resourceCountIs('AWS::Logs::LogGroup', 6);
  template.resourceCountIs('AWS::IAM::Policy', 14);
  template.resourceCountIs('AWS::ECS::Service', 6);
  template.resourceCountIs('AWS::ServiceDiscovery::Service', 6);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 3);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 6);
});

test('Create infra with two bots, one prod and one test', () => {
  const app = new App();
  config.rasaBots =  [
    {rasaPort: 1, actionsPort: 2, projectId: 'veryrealid', customerName: 'veryrealcustomer', projectName: 'veryrealcustomer', hasProd: false},
    {rasaPort: 3, actionsPort: 4, projectId: 'veryrealid2', customerName: 'veryrealcustomer2', projectName: 'veryrealcustomer2', hasProd: true}
  ];

  // WHEN
  const teststack = new InfraStack(app, 'MyTestStack', {
    config,
    env: {
      account: config.env.account,
      region: config.env.region
    },
    envName: config.envName
  });
  // THEN
  const template = Template.fromStack(teststack);
  template.resourceCountIs('AWS::EC2::VPC', 1);
  template.resourceCountIs('AWS::EC2::Subnet', 4);
  template.resourceCountIs('AWS::EC2::RouteTable', 4);
  template.resourceCountIs('AWS::ECR::Repository', 2);
  template.resourceCountIs('AWS::ECS::Cluster', 1);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
  template.resourceCountIs('AWS::Route53::RecordSet', 3);
  template.resourceCountIs('AWS::EC2::VPCEndpoint', 5);
  template.resourceCountIs('AWS::EC2::SecurityGroup', 12);
  template.resourceCountIs('AWS::SecretsManager::Secret', 1);
  template.resourceCountIs('AWS::ECS::TaskDefinition', 6);
  template.resourceCountIs('AWS::IAM::Role', 20);
  template.resourceCountIs('AWS::Logs::LogGroup', 6);
  template.resourceCountIs('AWS::IAM::Policy', 14);
  template.resourceCountIs('AWS::ECS::Service', 6);
  template.resourceCountIs('AWS::ServiceDiscovery::Service', 6);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 3);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 6);
});