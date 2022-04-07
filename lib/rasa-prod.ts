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
  envName: string;
  defaultRepositories: DefaultRepositories;
  baseCluster: ecs.ICluster;
  baseVpc: ec2.IVpc;
  baseLoadbalancer: elbv2.IApplicationLoadBalancer;
  baseCertificate: acm.ICertificate;
  baseTargetGroups: elbv2.IApplicationTargetGroup[];
  botfrontService: ecs.FargateService;
  rasaVersion: string;
  actionsVersion: string;
  customerName: string;
  rasaPort: number;
  actionsPort: number;
  projectId: string;
  rasaPortProd: number | undefined;
  actionsPortProd: number | undefined;
  botfrontPort: number;
}

export class ProdRasa extends Construct {
  constructor(scope: Construct, id: string, props: RasaProps) {
    super(scope, id);
    const prefix = createPrefix(props.envName, this.constructor.name);
    const graphqlSecret = secrets.Secret.fromSecretNameV2(this, `${prefix}botfront-graphql-secret`, `${props.envName}/graphql/apikey`);
    const actionsSecret = secrets.Secret.fromSecretNameV2(this, `${prefix}actions-ptv-secret`, `${props.envName}/actions/servicerecommender`);

      // Rasa #1
      const rasarepo = ecr.Repository.fromRepositoryName(this, `${prefix}repository-rasa-${props.customerName}`, props.defaultRepositories.rasaBotRepository);

      const rasatd = new ecs.TaskDefinition(this, `${prefix}taskdefinition-rasa-${props.customerName}`, {
        cpu: '2048',
        memoryMiB: '4096',
        compatibility: ecs.Compatibility.FARGATE
      });

      rasatd.addVolume({
        name: `rasavolume-${props.customerName}`,
      });

      rasatd.addContainer(`${prefix}container-rasa-${props.customerName}`, {
        image: ecs.ContainerImage.fromEcrRepository(rasarepo, props.rasaVersion),
        containerName: `rasa-${props.customerName}`,
        portMappings: [{
          hostPort: props.rasaPort,
          containerPort: props.rasaPort
        }],
        command: ["rasa", "run", "--enable-api", "--debug",  "--port", props.rasaPort.toString(), "--auth-token", graphqlSecret.secretValue.toString()],
        environment: {
          BF_PROJECT_ID: props.projectId,
          PORT: props.rasaPort.toString(),
          BF_URL: `http://botfront.${props.envName}service.internal:${props.botfrontPort.toString()}/graphql`
        },
        secrets: {
          API_KEY: ecs.Secret.fromSecretsManager(graphqlSecret)
        },
        logging: ecs.LogDriver.awsLogs({
          streamPrefix: `${prefix}container-rasa-${props.customerName}`,
          logRetention: logs.RetentionDays.ONE_DAY
        })
      }).addMountPoints(
        {
          containerPath: '/app/models',
          sourceVolume: `rasavolume-${props.customerName}`,
          readOnly: false
        }
      );

      const rasaservice = new ecs.FargateService(this, `${prefix}service-rasa-${props.customerName}`, {
        cluster: props.baseCluster,
        taskDefinition: rasatd,
        cloudMapOptions: {
          name: `rasa-${props.customerName}`
        },
        serviceName: `${props.envName}-service-rasa-${props.customerName}`
      });

      props.baseTargetGroups.find(tg => tg.targetGroupName == `tg-rasa-${props.customerName}`)?.addTarget(rasaservice);

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
          BF_URL: `http://botfront.${props.envName}service.internal:${props.botfrontPort.toString()}/graphql`
        },
        secrets: {
          AURORA_API_ENDPOINT: ecs.Secret.fromSecretsManager(actionsSecret, 'API_ENDPOINT'),
          AURORA_API_KEY: ecs.Secret.fromSecretsManager(actionsSecret, 'API_KEY'),
          AURORA_API_CLIENT_ID: ecs.Secret.fromSecretsManager(actionsSecret, 'API_CLIENT_ID')
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
          name: `actions-${props.customerName}`
        },
        serviceName: `${props.envName}-service-actions-${props.customerName}`
      });

      props.baseTargetGroups.find(tg => tg.targetGroupName == `tg-actions-${props.customerName}`)?.addTarget(rasaservice);

      actionsservice.connections.allowFrom(props.botfrontService, ec2.Port.tcp(props.actionsPort));
      actionsservice.connections.allowFrom(rasaservice, ec2.Port.tcp(props.actionsPort));

      // Rasa #2
      if (props.rasaPortProd != undefined) {
        const modelBucket = s3.Bucket.fromBucketName(this, `${prefix}model-bucket-${props.customerName}`, `${prefix}model-bucket`)
        const rasaProdtd = new ecs.TaskDefinition(this, `${prefix}taskdefinition-rasa-prod-${props.customerName}`, {
          cpu: '1024',
          memoryMiB: '2048',
          compatibility: ecs.Compatibility.FARGATE
        });
  
        modelBucket.grantRead(rasaProdtd.taskRole, `model-${props.projectId}.tar.gz`);
  
        rasaProdtd.addContainer(`${prefix}container-rasa-prod-${props.customerName}`, {
          image: ecs.ContainerImage.fromEcrRepository(rasarepo, props.rasaVersion),
          containerName: `rasa-prod-${props.customerName}`,
          portMappings: [{
            hostPort: props.rasaPortProd,
            containerPort: props.rasaPortProd
          }],
          command: ["rasa", "run", "--enable-api", "--debug",  "--port", props.rasaPortProd.toString(), "--auth-token", graphqlSecret.secretValue.toString()],
          environment: {
            BF_PROJECT_ID: props.projectId,
            PORT: props.rasaPort.toString(),
            BF_URL: `http://botfront.${props.envName}service.internal:${props.botfrontPort.toString()}/graphql`,
            BUCKET_NAME: modelBucket.bucketName
          },
          secrets: {
            API_KEY: ecs.Secret.fromSecretsManager(graphqlSecret)
          },
          logging: ecs.LogDriver.awsLogs({
            streamPrefix: `${prefix}container-rasa-prod-${props.customerName}`,
            logRetention: logs.RetentionDays.ONE_DAY
          })
        });
  
        const rasaprodservice = new ecs.FargateService(this, `${prefix}service-rasa-prod-${props.customerName}`, {
          cluster: props.baseCluster,
          taskDefinition: rasaProdtd,
          cloudMapOptions: {
            name: `rasa-prod-${props.customerName}`
          },
          serviceName: `${props.envName}-service-rasa-prod-${props.customerName}`
        });
  
        props.baseTargetGroups.find(tg => tg.targetGroupName == `tg-rasa-prod-${props.customerName}`)?.addTarget(rasaservice);
  
        rasaprodservice.connections.allowFrom(props.baseLoadbalancer, ec2.Port.tcp(props.rasaPortProd));
        rasaprodservice.connections.allowFrom(props.botfrontService, ec2.Port.tcp(props.rasaPortProd));
        rasaprodservice.connections.allowFrom(props.botfrontService, ec2.Port.tcp(props.actionsPort));

        if(props.actionsPortProd != undefined) {
          const actionsprodtd = new ecs.TaskDefinition(this, `${prefix}taskdefinition-actions-prod-${props.customerName}`, {
            cpu: '256',
            memoryMiB: '512',
            compatibility: ecs.Compatibility.FARGATE
          });
    
          actionsprodtd.addContainer(`${prefix}actions-prod`, {
            image: ecs.ContainerImage.fromEcrRepository(actionsrepo, props.actionsVersion),
            containerName: `actions-prod-${props.customerName}`,
            portMappings: [{
              hostPort: props.actionsPortProd,
              containerPort: props.actionsPortProd
            }],
            command: ["start", "--actions", "actions", "--debug", "--port", props.actionsPortProd.toString()],
            environment: {
              PORT: props.actionsPortProd.toString(),
              BF_URL: `http://botfront.${props.envName}service.internal:${props.botfrontPort.toString()}/graphql`
            },
            secrets: {
              AURORA_API_ENDPOINT: ecs.Secret.fromSecretsManager(actionsSecret, 'API_ENDPOINT'),
              AURORA_API_KEY: ecs.Secret.fromSecretsManager(actionsSecret, 'API_KEY'),
              AURORA_API_CLIENT_ID: ecs.Secret.fromSecretsManager(actionsSecret, 'API_CLIENT_ID')
            },
            logging: ecs.LogDriver.awsLogs({
              streamPrefix: `${prefix}actions-prod-${props.customerName}`,
              logRetention: logs.RetentionDays.ONE_DAY
            })
          });
    
          const actionsprodservice = new ecs.FargateService(this, `${prefix}service-actions-prod-${props.customerName}`, {
            cluster: props.baseCluster,
            taskDefinition: actionsprodtd,
            cloudMapOptions: {
              name: `actions-prod-${props.customerName}`
            },
            serviceName: `${props.envName}-service-actions-prod-${props.customerName}`
          });

          props.baseTargetGroups.find(tg => tg.targetGroupName == `tg-actions-prod-${props.customerName}`)?.addTarget(rasaservice);

          actionsprodservice.connections.allowFrom(rasaprodservice, ec2.Port.tcp(props.actionsPortProd));
        } else {
          actionsservice.connections.allowFrom(rasaprodservice, ec2.Port.tcp(props.actionsPort));
        }
      }
  }
}