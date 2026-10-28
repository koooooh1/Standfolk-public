// Standfolk deployment on Azure Container Apps. The apps scale to zero when idle.
// Images are pulled from GitHub Container Registry; private packages require a read:packages token.

@description('Azure region for every resource.')
param location string = resourceGroup().location

@description('Short lowercase prefix for resource names.')
@minLength(3)
@maxLength(11)
param prefix string = 'standfolk'

@description('Image repository prefix, for example ghcr.io/<github-owner>.')
param imageRepository string

@description('Registry user name for private images (the GitHub owner). Leave empty for public images.')
param registryUsername string = ''

@description('GitHub token with read:packages for private images. Stored as a Container Apps secret only.')
@secure()
param registryPassword string = ''

@description('Image tag pushed to the repository, for example the short commit hash.')
param imageTag string

@description('Google AI Studio key for the agent service. Stored as a Container Apps secret only.')
@secure()
param modelApiKey string = ''

@description('Gemini model name.')
param modelName string = 'gemini-3.5-flash-lite'

@description('Model calls the API allows per day (reset at midnight Pacific time).')
param dailyModelCalls int = 40

var agentsName = '${prefix}-agents'
var webName = '${prefix}-web'
// Scale to zero when idle: an always-on replica for two weeks would exceed the free grant.
var scale = { minReplicas: 0, maxReplicas: 1 }
var privateImages = !empty(registryPassword)
var registries = privateImages ? [{ server: split(imageRepository, '/')[0], username: registryUsername, passwordSecretRef: 'registry-password' }] : []
var registrySecrets = privateImages ? [{ name: 'registry-password', value: registryPassword }] : []

// Consumption-only environment without a Log Analytics workspace, so there is no log ingestion cost.
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-env'
  location: location
  properties: {}
}

resource agents 'Microsoft.App/containerApps@2024-03-01' = {
  name: agentsName
  location: location
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      // Internal ingress: only apps in this environment (the web app) can reach the agent service.
      ingress: { external: false, targetPort: 8001, transport: 'http' }
      secrets: concat([{ name: 'model-api-key', value: modelApiKey }], registrySecrets)
      registries: registries
    }
    template: {
      containers: [
        {
          name: 'agents'
          image: '${imageRepository}/standfolk-agents:${imageTag}'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'MODEL_API_KEY', secretRef: 'model-api-key' }
            { name: 'MODEL_NAME', value: modelName }
          ]
        }
      ]
      scale: scale
    }
  }
}

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: webName
  location: location
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: { external: true, targetPort: 8080, transport: 'auto', allowInsecure: false }
      secrets: registrySecrets
      registries: registries
    }
    template: {
      containers: [
        {
          name: 'web'
          image: '${imageRepository}/standfolk-web:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            // Apps in one environment reach each other by name over the internal network.
            { name: 'AGENTS_URL', value: 'http://${agents.name}' }
            { name: 'AGENT_DAILY_MODEL_CALLS', value: string(dailyModelCalls) }
            { name: 'TRUST_PROXY', value: '1' }
          ]
          probes: [
            { type: 'Readiness', httpGet: { path: '/api/health', port: 8080 }, initialDelaySeconds: 3, periodSeconds: 10 }
            { type: 'Liveness', httpGet: { path: '/api/health', port: 8080 }, initialDelaySeconds: 10, periodSeconds: 30 }
          ]
        }
      ]
      // Keep one replica while budgets, rate limits, and story state remain process-local.
      scale: scale
    }
  }
}

output webUrl string = 'https://${web.properties.configuration.ingress.fqdn}'
