
import * as fs from 'fs-extra';
import { Construct } from 'constructs';
import {
  aws_cloudfront as cloudfront,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
  aws_route53 as route53,
  aws_route53_targets as route53targets,
  aws_certificatemanager as acm,
  RemovalPolicy
} from 'aws-cdk-lib';

import { RasaBot } from '../types/index';
import { createPrefix } from './utilities';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

interface WebChatProps {
  envName: string,
  domain: string,
  rasaBots: RasaBot[],
  subDomain: string,
  frontendVersion: string,
  sourceBucketName: string
}

export class Webchat extends Construct {
  public readonly rasaBotAddressMap: Map<RasaBot, string> = new Map<RasaBot, string>();

  constructor(scope: Construct, id: string, props: WebChatProps) {
    super(scope, id);
    const prefix = createPrefix(props.envName, this.constructor.name);
    const frontendBucket = new s3.Bucket(this, `${prefix}frontend-bucket`, { bucketName: `${prefix}frontend-bucket`, publicReadAccess: false, autoDeleteObjects: true, removalPolicy: RemovalPolicy.DESTROY });

    const cloudfrontAI = new cloudfront.OriginAccessIdentity(this, `${prefix}distribution-access-identity`, {
    });

    const codeBucket = s3.Bucket.fromBucketName(this, props.sourceBucketName, props.sourceBucketName);

    frontendBucket.grantRead(cloudfrontAI);


    const policyStatement = new PolicyStatement();
    policyStatement.addActions('s3:GetBucket*');
    policyStatement.addActions('s3:GetObject*');
    policyStatement.addActions('s3:List*');
    policyStatement.addResources(codeBucket.bucketArn);
    policyStatement.addResources(`${codeBucket.bucketArn}/*`);
    policyStatement.addCanonicalUserPrincipal(cloudfrontAI.cloudFrontOriginAccessIdentityS3CanonicalUserId);

    if (!codeBucket.policy) {
      new s3.BucketPolicy(this, 'Policy', { bucket: codeBucket }).document.addStatements(policyStatement);
    } else {
      codeBucket.policy.document.addStatements(policyStatement);
    }

    const hostedZone = route53.HostedZone.fromLookup(this, `${prefix}hosted-zone`, { domainName: props.domain });

    const cert = new acm.DnsValidatedCertificate(this, `${prefix}wildcard-https-certificate`, {
      domainName: `*.${props.subDomain}`,
      hostedZone,
      region: 'us-east-1'
    });

    // clear up the temp folder
    fs.removeSync(`temp/${prefix}`);

    for (const rasaBot of props.rasaBots) {

      const rasaBotDomain = `${rasaBot.projectName}.${props.subDomain}`;

      // write rasa config files to temp folder for the deployment
      fs.mkdirSync(`temp/${prefix}/${rasaBot.customerName}/config`, { recursive: true });

      const config = {
        additionalConfig: rasaBot.additionalConfig,
        language: 'fi',
        url: `${props.subDomain}:${rasaBot.rasaPort}`,
      };

      fs.writeFileSync(`temp/${prefix}/${rasaBot.customerName}/config/rasa-config.json`, JSON.stringify(config));

      const cloudFrontWebDistribution = new cloudfront.CloudFrontWebDistribution(this, `${prefix}frontend-distribution-${rasaBot.customerName}`, {
        defaultRootObject: 'index.html',
        errorConfigurations: [{
          errorCode: 404,
          errorCachingMinTtl: 60,
          responseCode: 200,
          responsePagePath: '/index.html'
        }],
        originConfigs: [
          {
            s3OriginSource: {
              originAccessIdentity: cloudfrontAI,
              originPath: `/frontend/${props.frontendVersion}`,
              s3BucketSource: codeBucket,
            },
            behaviors: [
              {
                isDefaultBehavior: true,
              }
            ]
          },
          {
            s3OriginSource: {
              originAccessIdentity: cloudfrontAI,
              s3BucketSource: frontendBucket,
              originPath: `/frontend-rasa-config/${rasaBot.customerName}`,
            },
            behaviors: [
              {
                pathPattern: '/config/*'
              }
            ]
          }
        ],
        viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(cert, {
          aliases: [
            rasaBotDomain
          ],
          securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2019
        })
      });

      new route53.ARecord(this, `${prefix}cf-route53-${rasaBot.customerName}`, {
        target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(cloudFrontWebDistribution)),
        zone: hostedZone,
        recordName: rasaBotDomain
      });

    }

    new s3deploy.BucketDeployment(this, `${prefix}frontend-bucket-deployment`, {
      sources: [s3deploy.Source.asset(`temp/${prefix}`)],
      destinationBucket: frontendBucket,
      destinationKeyPrefix: 'frontend-rasa-config',
      prune: false
    });
  }
}