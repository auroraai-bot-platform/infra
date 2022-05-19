import {
  Stack, RemovalPolicy,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_route53 as route53,
  aws_route53_targets as route53t,
  aws_certificatemanager as acm,
  aws_ssm as ssm
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as ecrdeploy from 'cdk-ecr-deployment';

import { createPrefix } from './utilities';
import { BaseStackProps, DefaultRepositories, RasaBot } from '../types';

interface EcsBaseProps extends BaseStackProps {
  defaultRepositories: DefaultRepositories;
  domain: string;
  subDomain: string;
  ecrRepos: RasaBot[];
  actionsTag: string | undefined;
}

export class EcsBaseStack extends Stack {
  public readonly baseVpc: ec2.Vpc;
  public readonly baseCluster: ecs.Cluster;
  public readonly baseLoadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly baseCertificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: EcsBaseProps) {
    super(scope, id, props);
    const prefix = createPrefix(props.envName, this.constructor.name);
    const latestActionsImageTag = ssm.StringParameter.fromStringParameterName(this, `${prefix}latest-actions-version`, 'actions-image-tag-latest').stringValue;
    const actionsTag = props.actionsTag? props.actionsTag : latestActionsImageTag;


    this.baseVpc = new ec2.Vpc(this, `${prefix}vpc`, {
      maxAzs: 2,
      natGateways: 1
    });

    this.baseVpc.addGatewayEndpoint(`${prefix}vpc-endpoint-s3`, {
      service: ec2.GatewayVpcEndpointAwsService.S3
    });

    this.baseVpc.addInterfaceEndpoint(`${prefix}vpc-endpoint-ecr`, {
      service: ec2.InterfaceVpcEndpointAwsService.ECR
    });

    this.baseVpc.addInterfaceEndpoint(`${prefix}vpc-endpoint-ecr-dkr`, {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER
    });

    this.baseVpc.addInterfaceEndpoint(`${prefix}vpc-endpoint-cloudwatch`, {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS
    });

    this.baseVpc.addInterfaceEndpoint(`${prefix}vpc-endpoint-secrets`, {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER
    });

    const zone = route53.HostedZone.fromLookup(this, `${prefix}route53-zone`, {domainName: props.domain});
    this.baseCertificate = new acm.Certificate(this, `${prefix}acm-certificate`, {
      domainName: props.subDomain,
      validation: acm.CertificateValidation.fromDns(zone)
    });

    const actionsBaseRepo = ecr.Repository.fromRepositoryName(this, `${prefix}ecr-actions`, props.defaultRepositories.actionsRepository)
    for (const ecrRepoConfig of props.ecrRepos) {
      const actionsRepo = new ecr.Repository(this, `${prefix}ecr-repository-actions-${ecrRepoConfig.customerName}`, {
        imageScanOnPush: true,
        repositoryName: `${props.envName}-actions-${ecrRepoConfig.customerName}`,
        removalPolicy: RemovalPolicy.RETAIN,
      });

      new ecrdeploy.ECRDeployment(this, `${prefix}deploy-actions-image-${ecrRepoConfig.customerName}`, {
        src: new ecrdeploy.DockerImageName(`${actionsBaseRepo.repositoryUri}:${actionsTag}`),
        dest: new ecrdeploy.DockerImageName(`${actionsRepo.repositoryUri}:${actionsTag}`),
      });
    }

    this.baseCluster = new ecs.Cluster(this, `${prefix}ecs-cluster`, {
      vpc: this.baseVpc,
      clusterName: `${props.envName}-cluster`,
      containerInsights: true,
      defaultCloudMapNamespace: {
        name: `${props.envName}service.internal`,
        vpc: this.baseVpc
      }
    });

    this.baseLoadBalancer = new elbv2.ApplicationLoadBalancer(this, `${prefix}alb-base`, {
      vpc: this.baseVpc,
      internetFacing: true
    });

    new route53.ARecord(this, `${prefix}route53-record-a`, {
      zone,
      target: route53.RecordTarget.fromAlias(new route53t.LoadBalancerTarget(this.baseLoadBalancer)),
      recordName: props.envName
    });
  }
}
