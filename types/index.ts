export interface RasaBot {
  actionsPort: number;
  actionsPortProd?: number
  customerName: string;
  projectId: string;
  projectName: string;
  rasaPort: number;
  rasaPortProd?: number;
  hasProd?: boolean;
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
  projectCreation: string;
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
  sourceBucketName: string;
  botfrontAdminEmail: string;
}

export interface DefaultRepositories {
  botfrontRepository: string;
  rasaBotRepository: string;
  actionsRepository: string;
}

export interface LambdaRequest {
  tokenSecretArn: string;
  botfrontBaseUrl: string;
  projects: Project[];
  timestamp: number;
}

export interface Project {
  baseUrl: string;
  name: string;
  nameSpace: string;
  projectId: string;
  host: string;
  token?: string;
  actionEndpoint: string;
  prodBaseUrl?: string;
  prodActionEndpoint?: string;
  hasProd?: boolean;
}