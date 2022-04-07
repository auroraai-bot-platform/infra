import {
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_route53 as route53,
  aws_route53_targets as route53t,
  aws_certificatemanager as acm,
  Duration
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as ecrdeploy from 'cdk-ecr-deployment';

import { createPrefix } from './utilities';
import { DefaultRepositories, RasaBot } from '../types';

export interface NetworkProps {
  envName: string;
  defaultRepositories: DefaultRepositories;
  domain: string;
  subDomain: string;
  ecrRepos: RasaBot[];
  actionsTag: string;
  ports: {
    botfrontPort: number;
    ducklingPort: number;
    restApiPort: number;
  }
}

export class Network extends Construct {
  public readonly baseVpc: ec2.Vpc;
  public readonly baseCluster: ecs.Cluster;
  public readonly baseTargetGroups: elbv2.ApplicationTargetGroup[];
  public readonly baseLoadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly baseCertificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: NetworkProps) {
    super(scope, id);
    const prefix = createPrefix(props.envName, this.constructor.name);

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
      subjectAlternativeNames: [`*.${props.subDomain}`],
      validation: acm.CertificateValidation.fromDns(zone)
    });

    const actionsBaseRepo = ecr.Repository.fromRepositoryName(this, `${prefix}ecr-actions`, props.defaultRepositories.actionsRepository)
    for (const ecrRepoConfig of props.ecrRepos) {
      const actionsRepo = new ecr.Repository(this, `${prefix}ecr-repository-actions-${ecrRepoConfig.customerName}`, {
        imageScanOnPush: true,
        repositoryName: `${props.envName}-actions-${ecrRepoConfig.customerName}`
      });

      new ecrdeploy.ECRDeployment(this, `${prefix}deploy-actions-image-${ecrRepoConfig.customerName}`, {
        src: new ecrdeploy.DockerImageName(`${actionsBaseRepo.repositoryUri}:${props.actionsTag}`),
        dest: new ecrdeploy.DockerImageName(`${actionsRepo.repositoryUri}:${props.actionsTag}`),
      });
    }

    this.baseCluster = new ecs.Cluster(this, `${prefix}ecs-cluster`, {
      vpc: this.baseVpc,
      clusterName: `${props.envName}-cluster`,
      containerInsights: false,
      defaultCloudMapNamespace: {
        name: `${props.envName}service.internal`,
        vpc: this.baseVpc
      }
    });

    this.baseLoadBalancer = new elbv2.ApplicationLoadBalancer(this, `${prefix}alb-base`, {
      vpc: this.baseVpc,
      internetFacing: true
    });

    this.baseLoadBalancer.addRedirect({
    });

    this.baseTargetGroups = [];

    this.baseTargetGroups.push(new elbv2.ApplicationTargetGroup(this,  `${prefix}tg-base`, {
      port: props.ports.botfrontPort,
      vpc: this.baseVpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      deregistrationDelay: Duration.seconds(30),
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        healthyThresholdCount: 2,
        interval: Duration.seconds(10),
        timeout: Duration.seconds(5)
      },
      targetGroupName: 'tg-botfront'
    }));

    const httpslistener = this.baseLoadBalancer.addListener(`${prefix}alb-listener-https`, {
      port: 443,
      defaultTargetGroups: [this.baseTargetGroups[0]],
      certificates: [this.baseCertificate]
    });

    for (const rasaBot of props.ecrRepos) {
      this.baseTargetGroups.push(new elbv2.ApplicationTargetGroup(this, `${prefix}tg-rasa-${rasaBot.customerName}`, {
        protocol: elbv2.ApplicationProtocol.HTTP,
        vpc: this.baseVpc,
        port: rasaBot.rasaPort,
        deregistrationDelay: Duration.seconds(30),
        healthCheck: {
          path: '/',
          healthyThresholdCount: 2,
          interval: Duration.seconds(10),
          timeout: Duration.seconds(5)
        },
        targetType: elbv2.TargetType.IP,
        targetGroupName: `tg-rasa-${rasaBot.customerName}`
      }));
      httpslistener.addTargetGroups(`${prefix}-tg-listener-rasa-${rasaBot.customerName}`, {
        targetGroups: [this.baseTargetGroups[this.baseTargetGroups.length -1]],
        conditions: [
          elbv2.ListenerCondition.pathPatterns(['/rasa/socket.io', '/rasa/socket.io/*'])
        ],
        priority: this.baseTargetGroups.length * 10
      });
      this.baseTargetGroups.push(new elbv2.ApplicationTargetGroup(this, `${prefix}tg-actions-${rasaBot.customerName}`, {
        protocol: elbv2.ApplicationProtocol.HTTP,
        vpc: this.baseVpc,
        port: rasaBot.actionsPort,
        deregistrationDelay: Duration.seconds(30),
        healthCheck: {
          path: '/actions',
          healthyThresholdCount: 2,
          interval: Duration.seconds(10),
          timeout: Duration.seconds(5)
        },
        targetType: elbv2.TargetType.IP,
        targetGroupName: `tg-actions-${rasaBot.customerName}`
      }));
      httpslistener.addTargetGroups(`${prefix}-tg-listener-actions-${rasaBot.customerName}`, {
        targetGroups: [this.baseTargetGroups[this.baseTargetGroups.length -1]],
        conditions: [
          elbv2.ListenerCondition.pathPatterns(['/actions/webhook', '/actions/webhook/*'])
        ],
        priority: this.baseTargetGroups.length * 10
      });
      if (rasaBot.hasProd === true) {
        if (rasaBot.rasaPortProd != undefined) {
          this.baseTargetGroups.push(new elbv2.ApplicationTargetGroup(this, `${prefix}tg-rasa-prod-${rasaBot.customerName}`, {
            protocol: elbv2.ApplicationProtocol.HTTP,
            vpc: this.baseVpc,
            port: rasaBot.rasaPortProd,
            deregistrationDelay: Duration.seconds(30),
            healthCheck: {
              path: '/',
              healthyThresholdCount: 2,
              interval: Duration.seconds(10),
              timeout: Duration.seconds(5)
            },
            targetType: elbv2.TargetType.IP,
            targetGroupName: `tg-rasa-prod-${rasaBot.customerName}`
          }));
          httpslistener.addTargetGroups(`${prefix}-tg-listener-rasa-prod-${rasaBot.customerName}`, {
            targetGroups: [this.baseTargetGroups[this.baseTargetGroups.length -1]],
            conditions: [
              elbv2.ListenerCondition.pathPatterns(['/rasa-prod/socket.io', '/rasa-prod/socket.io/*'])
            ],
            priority: this.baseTargetGroups.length * 10
          });
        }
        if (rasaBot.actionsPortProd != undefined) {
          this.baseTargetGroups.push(new elbv2.ApplicationTargetGroup(this, `${prefix}tg-actions-prod-${rasaBot.customerName}`, {
            protocol: elbv2.ApplicationProtocol.HTTP,
            vpc: this.baseVpc,
            port: rasaBot.actionsPortProd,
            deregistrationDelay: Duration.seconds(30),
            healthCheck: {
              path: '/actions',
              healthyThresholdCount: 2,
              interval: Duration.seconds(10),
              timeout: Duration.seconds(5)
            },
            targetType: elbv2.TargetType.IP,
            targetGroupName: `tg-actions-prod-${rasaBot.customerName}`
          }));
          httpslistener.addTargetGroups(`${prefix}-tg-listener-actions-prod-${rasaBot.customerName}`, {
            targetGroups: [this.baseTargetGroups[this.baseTargetGroups.length -1]],
            conditions: [
              elbv2.ListenerCondition.pathPatterns(['/actions-prod/webhook', '/actions-prod/webhook/*'])
            ],
            priority: this.baseTargetGroups.length * 10
          });
        }
      }
    }

    new route53.ARecord(this, `${prefix}route53-record-a`, {
      zone,
      target: route53.RecordTarget.fromAlias(new route53t.LoadBalancerTarget(this.baseLoadBalancer)),
      recordName: props.envName
    });
  }
}
