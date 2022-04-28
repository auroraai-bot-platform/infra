import {
  Stack, Duration,
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

import { BaseStackProps, DefaultRepositories, RasaBot } from '../types';
import { createPrefix } from './utilities';

interface EcsRasaProps extends BaseStackProps {
  defaultRepositories: DefaultRepositories;
  baseCluster: ecs.ICluster;
  baseVpc: ec2.IVpc;
  baseLoadbalancer: elbv2.IApplicationLoadBalancer;
  baseCertificate: acm.ICertificate;
  botfrontService: ecs.FargateService;
  rasaBots: RasaBot[];
  rasaVersion: string;
  actionsVersion: string;
}

export class EcsRasaStack extends Stack {
  constructor(scope: Construct, id: string, props: EcsRasaProps) {
    super(scope, id, props);
    const prefix = createPrefix(props.envName, this.constructor.name);
    const graphqlSecret = secrets.Secret.fromSecretNameV2(this, `${prefix}botfront-graphql-secret`, `${props.envName}/graphql/apikey`);
    const actionsSecret = secrets.Secret.fromSecretNameV2(this, `${prefix}actions-ptv-secret`, `${props.envName}/actions/servicerecommender`);
    for (const rasaBot of props.rasaBots) {

      // Rasa #1
      const modelBucket = s3.Bucket.fromBucketName(this, `${prefix}model-bucket-${rasaBot.customerName}`, `${props.envName}.ecsbf.model-bucket`);
      const rasarepo = ecr.Repository.fromRepositoryName(this, `${prefix}repository-rasa-${rasaBot.customerName}`, props.defaultRepositories.rasaBotRepository);

      const rasatd = new ecs.TaskDefinition(this, `${prefix}taskdefinition-rasa-${rasaBot.customerName}`, {
        cpu: '2048',
        memoryMiB: rasaBot.rasaLoadModels? '16384': '8192',
        compatibility: ecs.Compatibility.FARGATE
      });

      rasatd.addVolume({
        name: `rasavolume-${rasaBot.customerName}`
      });

      let environment: ecs.ContainerDefinitionOptions['environment'];
      if (rasaBot.rasaLoadModels) {
        environment = {
          BF_PROJECT_ID: rasaBot.projectId,
          PORT: rasaBot.rasaPort.toString(),
          BF_URL: `http://botfront.${props.envName}service.internal:8888/graphql`,
          MODEL_BUCKET: modelBucket.bucketName,
          LANGUAGE_MODEL_S3_DIR: 'bert/',
          LANGUAGE_MODEL_LOCAL_DIR: '/app/models',
          AWS_ENDPOINT: ''
        }
        modelBucket.grantRead(rasatd.taskRole);
      } else {
        environment = {
          BF_PROJECT_ID: rasaBot.projectId,
          PORT: rasaBot.rasaPort.toString(),
          BF_URL: `http://botfront.${props.envName}service.internal:8888/graphql`
        }
      }

      rasatd.addContainer(`${prefix}container-rasa-${rasaBot.customerName}`, {
        image: ecs.ContainerImage.fromEcrRepository(rasarepo, props.rasaVersion),
        containerName: `rasa-${rasaBot.customerName}`,
        portMappings: [{
          hostPort: rasaBot.rasaPort,
          containerPort: rasaBot.rasaPort
        }],
        command: rasaBot.rasaLoadModels? 
        ["rasa", "run", "--enable-api", "--debug",  "--port", rasaBot.rasaPort.toString(), "--auth-token", graphqlSecret.secretValue.toString(), "--load-s3-language-models"] :
        ["rasa", "run", "--enable-api", "--debug",  "--port", rasaBot.rasaPort.toString(), "--auth-token", graphqlSecret.secretValue.toString()],
        environment: environment,
        secrets: {
          API_KEY: ecs.Secret.fromSecretsManager(graphqlSecret)
        },
        logging: ecs.LogDriver.awsLogs({
          streamPrefix: `${prefix}container-rasa-${rasaBot.customerName}`,
          logRetention: logs.RetentionDays.ONE_DAY
        })
      }).addMountPoints(
        {
          containerPath: '/app/models',
          sourceVolume: `rasavolume-${rasaBot.customerName}`,
          readOnly: false
        }
      );

      const rasaservice = new ecs.FargateService(this, `${prefix}service-rasa-${rasaBot.customerName}`, {
        cluster: props.baseCluster,
        taskDefinition: rasatd,
        cloudMapOptions: {
          name: `rasa-${rasaBot.customerName}`
        },
        serviceName: `${props.envName}-service-rasa-${rasaBot.customerName}`
      });

      const rasalistener = new elbv2.ApplicationListener(this, `${prefix}listener-rasa-${rasaBot.customerName}`, {
        loadBalancer: props.baseLoadbalancer,
        port: rasaBot.rasaPort,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [props.baseCertificate]
      });

      const rasatg = new elbv2.ApplicationTargetGroup(this, `${prefix}targetgroup-rasa-${rasaBot.customerName}`, {
        targets: [rasaservice],
        protocol: elbv2.ApplicationProtocol.HTTP,
        vpc: props.baseVpc,
        port: rasaBot.rasaPort,
        deregistrationDelay: Duration.seconds(30),
        healthCheck: {
          interval: Duration.seconds(300),
          healthyThresholdCount: 5,
          timeout: Duration.seconds(60),
          unhealthyThresholdCount: 5
        }
      });

      rasalistener.addTargetGroups(`${prefix}targetgroupadd-rasa-${rasaBot.customerName}`, {
        targetGroups: [rasatg],
        priority: 1,
        conditions: [
          elbv2.ListenerCondition.pathPatterns(['/socket.io', '/socket.io/*'])
        ]
      });

      rasalistener.addAction(`${prefix}blockdefault-rasa-${rasaBot.customerName}`, {
        action: elbv2.ListenerAction.fixedResponse(403)
      });

      rasaservice.connections.allowFrom(props.baseLoadbalancer, ec2.Port.tcp(rasaBot.rasaPort));
      rasaservice.connections.allowFrom(props.botfrontService, ec2.Port.tcp(rasaBot.rasaPort));
      rasaservice.connections.allowFrom(props.botfrontService, ec2.Port.tcp(rasaBot.actionsPort));

      // Actions
      const actionsrepo = ecr.Repository.fromRepositoryName(this, `${prefix}repository-actions-${rasaBot.customerName}`, `${props.envName}-actions-${rasaBot.customerName}`);

      const actionstd = new ecs.TaskDefinition(this, `${prefix}taskdefinition-actions-${rasaBot.customerName}`, {
        cpu: '256',
        memoryMiB: '512',
        compatibility: ecs.Compatibility.FARGATE
      });

      actionstd.addContainer(`${prefix}actions`, {
        image: ecs.ContainerImage.fromEcrRepository(actionsrepo, props.actionsVersion),
        containerName: `actions-${rasaBot.customerName}`,
        portMappings: [{
          hostPort: rasaBot.actionsPort,
          containerPort: rasaBot.actionsPort
        }],
        command: ["start", "--actions", "actions", "--debug", "--port", rasaBot.actionsPort.toString()],
        environment: {
          PORT: rasaBot.actionsPort.toString(),
          BF_URL: `http://botfront.${props.envName}service.internal:8888/graphql`
        },
        secrets: {
          AURORA_API_ENDPOINT: ecs.Secret.fromSecretsManager(actionsSecret, 'API_ENDPOINT'),
          AURORA_API_KEY: ecs.Secret.fromSecretsManager(actionsSecret, 'API_KEY'),
          AURORA_API_CLIENT_ID: ecs.Secret.fromSecretsManager(actionsSecret, 'API_CLIENT_ID')
        },
        logging: ecs.LogDriver.awsLogs({
          streamPrefix: `${prefix}actions-${rasaBot.customerName}`,
          logRetention: logs.RetentionDays.ONE_DAY
        })
      });

      const actionsservice = new ecs.FargateService(this, `${prefix}service-actions-${rasaBot.customerName}`, {
        cluster: props.baseCluster,
        taskDefinition: actionstd,
        cloudMapOptions: {
          name: `actions-${rasaBot.customerName}`
        },
        serviceName: `${props.envName}-service-actions-${rasaBot.customerName}`
      });

      const actionslistener = new elbv2.ApplicationListener(this, `${prefix}listener-actions-${rasaBot.customerName}`, {
        loadBalancer: props.baseLoadbalancer,
        port: rasaBot.actionsPort,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [props.baseCertificate]
      });

      const actionstg = new elbv2.ApplicationTargetGroup(this, `${prefix}targetgroup-actions-${rasaBot.customerName}`, {
        targets: [actionsservice],
        protocol: elbv2.ApplicationProtocol.HTTP,
        vpc: props.baseVpc,
        port: rasaBot.actionsPort,
        healthCheck: {
          path: '/actions',
          healthyThresholdCount: 2,
          interval: Duration.seconds(10),
          timeout: Duration.seconds(5)
        },
        deregistrationDelay: Duration.seconds(30)
      });

      actionslistener.addTargetGroups(`${prefix}targetgroupadd-actions-${rasaBot.customerName}`, {
        targetGroups: [actionstg]
      });

      actionsservice.connections.allowFrom(props.botfrontService, ec2.Port.tcp(rasaBot.actionsPort));
      actionsservice.connections.allowFrom(rasaservice, ec2.Port.tcp(rasaBot.actionsPort));

      // Rasa #2
      if (rasaBot.rasaPortProd != undefined) {
        const rasaProdtd = new ecs.TaskDefinition(this, `${prefix}taskdefinition-rasa-prod-${rasaBot.customerName}`, {
          cpu: '1024',
          memoryMiB: '2048',
          compatibility: ecs.Compatibility.FARGATE
        });
  
        modelBucket.grantRead(rasaProdtd.taskRole);

        let environment: ecs.ContainerDefinitionOptions['environment'];
        if (rasaBot.rasaLoadModels) {
          environment = {
            BF_PROJECT_ID: rasaBot.projectId,
            PORT: rasaBot.rasaPort.toString(),
            BF_URL: `http://botfront.${props.envName}service.internal:8888/graphql`,
            BUCKET_NAME: modelBucket.bucketName,
            MODEL_BUCKET: modelBucket.bucketName,
            LANGUAGE_MODEL_S3_DIR: 'bert/',
            LANGUAGE_MODEL_LOCAL_DIR: '/app/models',
            AWS_ENDPOINT: ''
          }
        } else {
          environment = {
            BF_PROJECT_ID: rasaBot.projectId,
            PORT: rasaBot.rasaPort.toString(),
            BF_URL: `http://botfront.${props.envName}service.internal:8888/graphql`,
            BUCKET_NAME: modelBucket.bucketName
          }
        }
  
        rasaProdtd.addContainer(`${prefix}container-rasa-prod-${rasaBot.customerName}`, {
          image: ecs.ContainerImage.fromEcrRepository(rasarepo, props.rasaVersion),
          containerName: `rasa-prod-${rasaBot.customerName}`,
          portMappings: [{
            hostPort: rasaBot.rasaPortProd,
            containerPort: rasaBot.rasaPortProd
          }],
          command: rasaBot.rasaLoadModels? 
            ["rasa", "run", "--enable-api", "--debug",  "--port", rasaBot.rasaPortProd.toString(), "--auth-token", graphqlSecret.secretValue.toString(), "--load-s3-language-models"] :
            ["rasa", "run", "--enable-api", "--debug",  "--port", rasaBot.rasaPortProd.toString(), "--auth-token", graphqlSecret.secretValue.toString()],
          environment: environment,
          secrets: {
            API_KEY: ecs.Secret.fromSecretsManager(graphqlSecret)
          },
          logging: ecs.LogDriver.awsLogs({
            streamPrefix: `${prefix}container-rasa-prod-${rasaBot.customerName}`,
            logRetention: logs.RetentionDays.ONE_DAY
          })
        });
  
        const rasaprodservice = new ecs.FargateService(this, `${prefix}service-rasa-prod-${rasaBot.customerName}`, {
          cluster: props.baseCluster,
          taskDefinition: rasaProdtd,
          cloudMapOptions: {
            name: `rasa-prod-${rasaBot.customerName}`
          },
          serviceName: `${props.envName}-service-rasa-prod-${rasaBot.customerName}`
        });
  
        const rasaprodlistener = new elbv2.ApplicationListener(this, `${prefix}listener-rasa-prod-${rasaBot.customerName}`, {
          loadBalancer: props.baseLoadbalancer,
          port: rasaBot.rasaPortProd,
          protocol: elbv2.ApplicationProtocol.HTTPS,
          certificates: [props.baseCertificate]
        });
  
        const rasaprodtg = new elbv2.ApplicationTargetGroup(this, `${prefix}targetgroup-rasa-prod-${rasaBot.customerName}`, {
          targets: [rasaprodservice],
          protocol: elbv2.ApplicationProtocol.HTTP,
          vpc: props.baseVpc,
          port: rasaBot.rasaPortProd
        });
  
        rasaprodlistener.addTargetGroups(`${prefix}targetgroupadd-rasa-prod-${rasaBot.customerName}`, {
          targetGroups: [rasaprodtg],
          priority: 1,
          conditions: [
            elbv2.ListenerCondition.pathPatterns(['/socket.io', '/socket.io/*'])
          ]
        });
  
        rasaprodlistener.addAction(`${prefix}blockdefault-rasa-prod-${rasaBot.customerName}`, {
          action: elbv2.ListenerAction.fixedResponse(403)
        });
  
        rasaprodservice.connections.allowFrom(props.baseLoadbalancer, ec2.Port.tcp(rasaBot.rasaPortProd));
        rasaprodservice.connections.allowFrom(props.botfrontService, ec2.Port.tcp(rasaBot.rasaPortProd));
        rasaprodservice.connections.allowFrom(props.botfrontService, ec2.Port.tcp(rasaBot.actionsPort));

        if(rasaBot.actionsPortProd != undefined) {
          const actionsprodtd = new ecs.TaskDefinition(this, `${prefix}taskdefinition-actions-prod-${rasaBot.customerName}`, {
            cpu: '256',
            memoryMiB: '512',
            compatibility: ecs.Compatibility.FARGATE
          });
    
          actionsprodtd.addContainer(`${prefix}actions-prod`, {
            image: ecs.ContainerImage.fromEcrRepository(actionsrepo, props.actionsVersion),
            containerName: `actions-prod-${rasaBot.customerName}`,
            portMappings: [{
              hostPort: rasaBot.actionsPortProd,
              containerPort: rasaBot.actionsPortProd
            }],
            command: ["start", "--actions", "actions", "--debug", "--port", rasaBot.actionsPortProd.toString()],
            environment: {
              PORT: rasaBot.actionsPortProd.toString(),
              BF_URL: `http://botfront.${props.envName}service.internal:8888/graphql`
            },
            secrets: {
              AURORA_API_ENDPOINT: ecs.Secret.fromSecretsManager(actionsSecret, 'API_ENDPOINT'),
              AURORA_API_KEY: ecs.Secret.fromSecretsManager(actionsSecret, 'API_KEY'),
              AURORA_API_CLIENT_ID: ecs.Secret.fromSecretsManager(actionsSecret, 'API_CLIENT_ID')
            },
            logging: ecs.LogDriver.awsLogs({
              streamPrefix: `${prefix}actions-prod-${rasaBot.customerName}`,
              logRetention: logs.RetentionDays.ONE_DAY
            })
          });
    
          const actionsprodservice = new ecs.FargateService(this, `${prefix}service-actions-prod-${rasaBot.customerName}`, {
            cluster: props.baseCluster,
            taskDefinition: actionsprodtd,
            cloudMapOptions: {
              name: `actions-prod-${rasaBot.customerName}`
            },
            serviceName: `${props.envName}-service-actions-prod-${rasaBot.customerName}`
          });

          actionsprodservice.connections.allowFrom(rasaprodservice, ec2.Port.tcp(rasaBot.actionsPortProd));
        } else {
          actionsservice.connections.allowFrom(rasaprodservice, ec2.Port.tcp(rasaBot.actionsPort));
        }
      }
    }
  }
}
