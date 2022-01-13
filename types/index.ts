import * as cdk from '@aws-cdk/core';

export interface BaseStackProps extends cdk.StackProps {
  envName: string;
}

export interface RasaBot {
  actionsPort: number;
  customerName: string;
  projectId: string;
  rasaPort: number;
  additionalConfig?: {
    intents: {
      [intentPath: string]: string;
    }
  }
}
export interface SoftwareVersions {
  frontend: string;
  botfront: string;
  rasa: string;
  actions: string;
}

export interface EnvironmentConfiguration {
  domain: string;
  env: {
    account: string;
    region: string;
  }
  envName: string;
  rasaBots: RasaBot[];
  subDomain: string;
  defaultRepositories: DefaultRepositories;
  softwareVersions: SoftwareVersions;
}

export interface DefaultRepositories {
  botfrontRepository: string;
  rasaBotRepository: string;
  actionsRepository: string;
}