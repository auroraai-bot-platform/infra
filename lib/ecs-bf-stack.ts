import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_ecr as ecr } from 'aws-cdk-lib';
import { aws_ecs as ecs } from 'aws-cdk-lib';
import { aws_elasticloadbalancingv2 as elbv2 } from 'aws-cdk-lib';
import { aws_certificatemanager as acm } from 'aws-cdk-lib';
import { aws_secretsmanager as secrets } from 'aws-cdk-lib';
import { aws_s3 as s3 } from 'aws-cdk-lib';
import {aws_lambda as lambda} from 'aws-cdk-lib';
import { custom_resources as customResources} from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_cloudformation as cf } from 'aws-cdk-lib';

import { BaseStackProps, DefaultRepositories, LambdaRequest, Project, RasaBot } from '../types';
import { createPrefix } from './utilities';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

interface EcsBfProps extends BaseStackProps {
  defaultRepositories: DefaultRepositories;
  baseCluster: ecs.Cluster,
  baseVpc: ec2.Vpc,
  baseLoadbalancer: elbv2.ApplicationLoadBalancer,
  baseCertificate: acm.Certificate,
  domain: string,
  mongoSecret: secrets.Secret,
  graphqlSecret: secrets.Secret,
  botfrontVersion: string;
  projectCreationVersion: string;
  sourceBucketName: string;
  rasaBots: RasaBot[];
  botfrontAdminEmail: string;
}

const restApiPort = 3030;
const webServicePort = 8888;

export class EcsBfStack extends cdk.Stack {
  public readonly botfrontService: ecs.FargateService;

  constructor(scope: Construct, id: string, props: EcsBfProps) {
    super(scope, id, props);

    const prefix = createPrefix(props.envName, this.constructor.name);
    const bfrepo = ecr.Repository.fromRepositoryName(this, `${prefix}repository-botfront`, props.defaultRepositories.botfrontRepository);

    const fileBucket = new s3.Bucket(this, `${prefix}file-bucket`, { bucketName: `${prefix}file-bucket`, publicReadAccess: true });
    const modelBucket = new s3.Bucket(this, `${prefix}model-bucket`, { bucketName: `${prefix}model-bucket` });


    const botfrontWaitHandle = new cf.CfnWaitConditionHandle(this, `${prefix}botfront-waithandle`);

    const botfrontAdminSecretName = `${prefix}botfront-admin-password`;
    const botfrontAdminSecret = new secrets.Secret(this, botfrontAdminSecretName, {
      secretName: botfrontAdminSecretName,
      generateSecretString: {
        excludePunctuation: true
      }
    });

    const botfronttd = new ecs.TaskDefinition(this, `${prefix}taskdefinition-botfront`, {
      cpu: '1024',
      memoryMiB: '4096',
      compatibility:  ecs.Compatibility.FARGATE
    });

    botfronttd.node.addDependency(botfrontWaitHandle);
    botfronttd.node.addDependency(botfrontAdminSecret);

    fileBucket.grantReadWrite(botfronttd.taskRole);
    fileBucket.grantDelete(botfronttd.taskRole);
    modelBucket.grantReadWrite(botfronttd.taskRole);
    modelBucket.grantDelete(botfronttd.taskRole);

    botfronttd.addContainer(`${prefix}container-botfront`, {
      image: ecs.ContainerImage.fromEcrRepository(bfrepo, props.botfrontVersion),
      containerName: 'botfront',
      portMappings: [
        {
          hostPort: webServicePort,
          containerPort: webServicePort
        }, 
        {
          hostPort: restApiPort,
          containerPort: restApiPort
        }
      ],
      environment: {
        PORT: webServicePort.toString(),
        REST_API_PORT: restApiPort.toString(),
        ROOT_URL: `https://${props.envName}.${props.domain}`,
        FILE_BUCKET: fileBucket.bucketName,
        MODEL_BUCKET: modelBucket.bucketName,
        FILE_PREFIX: 'files/',
        FILE_SIZE_LIMIT: `${1024 * 1024}`,
        SIGNAL_URL: `${botfrontWaitHandle.ref}`,
        ADMIN_USER: props.botfrontAdminEmail,
      },
      secrets: {
        MONGO_URL: ecs.Secret.fromSecretsManager(props.mongoSecret),
        API_KEY: ecs.Secret.fromSecretsManager(props.graphqlSecret),
        ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(botfrontAdminSecret)
      },
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: `${prefix}botfront`,
        logRetention: RetentionDays.ONE_DAY
      }),
      essential: true,
    });

    this.botfrontService = new ecs.FargateService(this, `${prefix}service-botfront`, {
      cluster: props.baseCluster,
      taskDefinition: botfronttd,
      cloudMapOptions: {
        name: 'botfront'
      },
      serviceName: `${props.envName}-service-botfront`
    });


    const botfrontWaitCondition = new cf.CfnWaitCondition(this, `${prefix}botfront-waitcondition`, {
      handle: botfrontWaitHandle.ref,
      timeout: '600'
    });

    botfrontWaitCondition.node.addDependency(this.botfrontService);

    const listener = new elbv2.ApplicationListener(this, `${prefix}listener-botfront`, {
      loadBalancer: props.baseLoadbalancer,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [props.baseCertificate]
    });

    const tg = new elbv2.ApplicationTargetGroup(this, `${prefix}targetgroup-botfront`, {
      targets: [this.botfrontService],
      protocol: elbv2.ApplicationProtocol.HTTP,
      vpc: props.baseVpc,
      port: webServicePort,
      deregistrationDelay: cdk.Duration.seconds(30),
      healthCheck: {
        path: '/',
        healthyThresholdCount: 2,
        interval: cdk.Duration.seconds(10),
        timeout: cdk.Duration.seconds(5)
      }
    });

    listener.addTargetGroups(`${prefix}targetgroupadd-botfront`, {
      targetGroups: [tg]
    });

    if (!props.baseCluster.defaultCloudMapNamespace) {
      throw new Error('Cluster Namespace not defined');
    }
    const botfrontInternalUrl = `http://${this.botfrontService.cloudMapService?.serviceName}.${props.baseCluster.defaultCloudMapNamespace.namespaceName}:${restApiPort}`;

    const lambdaRequest: LambdaRequest = {
      tokenSecretArn: props.graphqlSecret.secretArn,
      botfrontBaseUrl: botfrontInternalUrl,
      timestamp: Date.now(),
      projects: props?.rasaBots?.map<Project>((bot) => {
        return {
          name: bot.projectName,
          nameSpace: `bf-${bot.customerName}`,
          projectId: bot.projectId,
          host: `http://rasa-${bot.customerName}.${props.baseCluster.defaultCloudMapNamespace?.namespaceName}:${bot.rasaPort}`,
          baseUrl: `https://${props.envName}.${props.domain}:${bot.rasaPort}`,
          actionEndpoint: `http://actions-${bot.customerName}.${props.baseCluster.defaultCloudMapNamespace?.namespaceName}:${bot.actionsPort}/webhook`,
          hasProd: bot.hasProd,
          prodBaseUrl: `https://${props.envName}.${props.domain}:${bot.rasaPortProd}`,
          prodActionEndpoint: `http://actions-${bot.customerName}.${props.baseCluster.defaultCloudMapNamespace?.namespaceName}:${bot.actionsPort}/webhook`,
        }
      })
    };


    // lambda to create botfront project for each rasa bot
    const codeBucket = s3.Bucket.fromBucketName(this, props.sourceBucketName, props.sourceBucketName);

    const projectCreationLambda = new lambda.SingletonFunction(this, `${prefix}project-creation`, {
      uuid: 'c3cec8a4-65a9-4305-8372-b3e9444e4bae',
      functionName: `${props.envName}-botfront-project-creation-singleton`,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: new lambda.S3Code(codeBucket, `project-creation/${props.projectCreationVersion}.zip`),
      vpc: props.baseVpc,
      vpcSubnets:  {subnets: props.baseVpc.privateSubnets},
      timeout: cdk.Duration.minutes(1),
      environment: {
        VERSION: props.projectCreationVersion,
        BOTFRONT_URL: botfrontInternalUrl
      },
      logRetention: RetentionDays.ONE_DAY,
    });

    props.graphqlSecret.grantRead(projectCreationLambda);

    const lambdaTrigger = new customResources.AwsCustomResource(this, `${prefix}project-creation-lambda-trigger`, {
      functionName: `${props.envName}-botfront-project-creation-trigger`,
      policy: customResources.AwsCustomResourcePolicy.fromStatements([new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        effect: iam.Effect.ALLOW,
        resources: [projectCreationLambda.functionArn]
      })]),
      timeout: cdk.Duration.minutes(3),
      logRetention: RetentionDays.ONE_DAY,
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: projectCreationLambda.functionName,
          InvocationType: 'Event',
          Payload: JSON.stringify(lambdaRequest)
        },
        physicalResourceId: customResources.PhysicalResourceId.of(`${props.envName}-botfront-project-creation-trigger`)
      },
      onUpdate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: projectCreationLambda.functionName,
          InvocationType: 'Event',
          Payload: JSON.stringify(lambdaRequest)
        },
        physicalResourceId: customResources.PhysicalResourceId.of(`${props.envName}-botfront-project-creation-trigger`)
      }
    });

    lambdaTrigger.node.addDependency(this.botfrontService, botfrontWaitCondition);

    this.botfrontService.connections.allowFrom(props.baseLoadbalancer, ec2.Port.tcp(443));
    this.botfrontService.connections.allowFromAnyIpv4(ec2.Port.tcp(webServicePort));
    this.botfrontService.connections.allowFrom(projectCreationLambda, ec2.Port.tcp(restApiPort));

    console.log('url', botfrontInternalUrl);
  }
}