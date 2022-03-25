import {
  Duration,
  aws_logs as logs,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_certificatemanager as acm,
  aws_s3 as s3,
  aws_secretsmanager as secrets
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { DefaultRepositories } from '../types';
import { createPrefix } from './utilities';

interface RasaProps {
  envName: string,
  defaultRepositories: DefaultRepositories;
  baseCluster: ecs.ICluster,
  baseVpc: ec2.IVpc,
  baseLoadbalancer: elbv2.IApplicationLoadBalancer,
  baseCertificate: acm.ICertificate,
  botfrontService: ecs.FargateService,
  rasaVersion: string,
  actionsVersion: string,
  customerName: string,
  rasaPort: number,
  actionsPort: number,
  projectId: string,
  isProd?: boolean
}

export class Rasa extends Construct {
  constructor(scope: Construct, id: string, props: RasaProps) {
    super(scope, id);
    const prefix = createPrefix(props.envName, this.constructor.name);
    const graphqlSecret = secrets.Secret.fromSecretNameV2(this, `${prefix}rasa-graphql-secret`, `${props.envName}/graphql/apikey`);
    const modelBucket = s3.Bucket.fromBucketName(this, `${prefix}model-bucket-${props.customerName}`, `${prefix}model-bucket`)


      // Rasa #1
      const rasarepo = ecr.Repository.fromRepositoryName(this, `${prefix}repository-rasa-${props.customerName}`, props.defaultRepositories.rasaBotRepository);

      const rasatd = new ecs.TaskDefinition(this, `${prefix}taskdefinition-rasa-${props.customerName}`, {
        cpu: props.isProd? '1024': '2048',
        memoryMiB:  props.isProd? '2048': '4096',
        compatibility: ecs.Compatibility.FARGATE
      });

      if (props.isProd) {
        modelBucket.grantRead(rasatd.taskRole, `model-${props.projectId}.tar.gz`);
      } else {
        rasatd.addVolume({
          name: `rasavolume-${props.customerName}`,
        });
      }

      const rasacontainer = rasatd.addContainer(`${prefix}container-rasa-${props.customerName}`, {
        image: ecs.ContainerImage.fromEcrRepository(rasarepo, props.rasaVersion),
        containerName: `rasa-${props.customerName}`,
        portMappings: [{
          hostPort: props.rasaPort,
          containerPort: props.rasaPort
        }],
        command: props.isProd? ["start", "--actions", "actions", "--debug", "--port", props.actionsPort.toString()]:
          ["rasa", "run", "--enable-api", "--debug",  "--port", props.rasaPort.toString(), "--auth-token", graphqlSecret.secretValue.toString()],
        environment: {
          BF_PROJECT_ID: props.projectId,
          PORT: props.rasaPort.toString(),
          BF_URL: `http://botfront.${props.envName}service.internal:8888/graphql`,
          BUCKET_NAME: props.isProd? modelBucket.bucketName: ''
        },
        secrets: {
          API_KEY: ecs.Secret.fromSecretsManager(graphqlSecret)
        },
        logging: ecs.LogDriver.awsLogs({
          streamPrefix: `${prefix}container-rasa-${props.customerName}`,
          logRetention: logs.RetentionDays.ONE_DAY
        })
      });

      if (!props.isProd) {
        rasacontainer.addMountPoints(
          {
            containerPath: '/app/models',
            sourceVolume: `rasavolume-${props.customerName}`,
            readOnly: false
          }
        )
      }

      const rasaservice = new ecs.FargateService(this, `${prefix}service-rasa-${props.customerName}`, {
        cluster: props.baseCluster,
        taskDefinition: rasatd,
        cloudMapOptions: {
          name: `rasa-${props.customerName}`
        },
        serviceName: `${props.envName}-service-rasa${props.isProd? '-prod': ''}-${props.customerName}`
      });

      const rasalistener = new elbv2.ApplicationListener(this, `${prefix}listener-rasa-${props.customerName}`, {
        loadBalancer: props.baseLoadbalancer,
        port: props.rasaPort,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [props.baseCertificate]
      });

      const rasatg = new elbv2.ApplicationTargetGroup(this, `${prefix}targetgroup-rasa-${props.customerName}`, {
        targets: [rasaservice],
        protocol: elbv2.ApplicationProtocol.HTTP,
        vpc: props.baseVpc,
        port: props.rasaPort,
        deregistrationDelay: Duration.seconds(30),
        healthCheck: {
          path: '/',
          healthyThresholdCount: 2,
          interval: Duration.seconds(10),
          timeout: Duration.seconds(5)
        }
      });

      rasalistener.addTargetGroups(`${prefix}targetgroupadd-rasa-${props.customerName}`, {
        targetGroups: [rasatg],
        priority: 1,
        conditions: [
          elbv2.ListenerCondition.pathPatterns(['/socket.io', '/socket.io/*'])
        ]
      });

      rasalistener.addAction(`${prefix}blockdefault-rasa-${props.customerName}`, {
        action: elbv2.ListenerAction.fixedResponse(403)
      });

      rasaservice.connections.allowFrom(props.baseLoadbalancer, ec2.Port.tcp(props.rasaPort));
      rasaservice.connections.allowFrom(props.botfrontService, ec2.Port.tcp(props.rasaPort));
      rasaservice.connections.allowFrom(props.botfrontService, ec2.Port.tcp(props.actionsPort));

      // Actions
      const actionsrepo = ecr.Repository.fromRepositoryName(this, `${prefix}repository-actions-${props.customerName}`, `${props.envName}-actions-${props.customerName}`);

      const actionstd = new ecs.TaskDefinition(this, `${prefix}taskdefinition-actions-${props.customerName}`, {
        cpu: '256',
        memoryMiB: '512',
        compatibility: ecs.Compatibility.FARGATE
      });

      actionstd.addContainer(`${prefix}actions`, {
        image: ecs.ContainerImage.fromEcrRepository(actionsrepo, props.actionsVersion),
        containerName: `actions-${props.customerName}`,
        portMappings: [{
          hostPort: props.actionsPort,
          containerPort: props.actionsPort
        }],
        command: ["start", "--actions", "actions", "--debug", "--port", props.actionsPort.toString()],
        environment: {
          PORT: props.actionsPort.toString(),
          BF_URL: `http://botfront.${props.envName}service.internal:8888/graphql`
        },
        logging: ecs.LogDriver.awsLogs({
          streamPrefix: `${prefix}actions-${props.customerName}`,
          logRetention: logs.RetentionDays.ONE_DAY
        })
      });

      const actionsservice = new ecs.FargateService(this, `${prefix}service-actions-${props.customerName}`, {
        cluster: props.baseCluster,
        taskDefinition: actionstd,
        cloudMapOptions: {
          name: `actions${props.isProd? '-prod': ''}-${props.customerName}`
        },
        serviceName: `${props.envName}-service-actions${props.isProd? '-prod': ''}-${props.customerName}`
      });

      const actionslistener = new elbv2.ApplicationListener(this, `${prefix}listener-actions-${props.customerName}`, {
        loadBalancer: props.baseLoadbalancer,
        port: props.actionsPort,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [props.baseCertificate]
      });

      const actionstg = new elbv2.ApplicationTargetGroup(this, `${prefix}targetgroup-actions-${props.customerName}`, {
        targets: [actionsservice],
        protocol: elbv2.ApplicationProtocol.HTTP,
        vpc: props.baseVpc,
        port: props.actionsPort,
        healthCheck: {
          path: '/actions',
          healthyThresholdCount: 2,
          interval: Duration.seconds(10),
          timeout: Duration.seconds(5)
        },
        deregistrationDelay: Duration.seconds(30)
      });

      actionslistener.addTargetGroups(`${prefix}targetgroupadd-actions-${props.customerName}`, {
        targetGroups: [actionstg]
      });

      actionsservice.connections.allowFrom(props.botfrontService, ec2.Port.tcp(props.actionsPort));
      actionsservice.connections.allowFrom(rasaservice, ec2.Port.tcp(props.actionsPort));
  }
}
