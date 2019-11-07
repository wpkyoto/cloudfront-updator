
import CloudFrontUpdator, {
  interfaces
} from '../libs/index'

const condition: interfaces.Config = {
  debugMode: true,
  taskType: 'parallel',
  allowSensitiveAction: false
}
class DummyClient {
  // @ts-ignore
  getDistributionConfig (param: any) {
    return {
      promise (): AWS.CloudFront.GetDistributionConfigResult {
        const DistributionConfig: AWS.CloudFront.DistributionConfig = {
          Enabled: true
        } as AWS.CloudFront.DistributionConfig
        return {
          ETag: 'tag',
          DistributionConfig
        }
      }
    }
  }

  // @ts-ignore
  updateDistribution (param: any) {
    return {
      promise () {
        return {}
      }
    }
  }

  // @ts-ignore
  listDistributions (param: any) {
    return {
      promise () {
        return {}
      }
    }
  }
}
describe('dummy', () => {
  // @ts-ignore
  const updator: interfaces.UpdatorFunction = (dist, conf) => conf
  const filter: interfaces.FilterCondition = () => true
  let client = new CloudFrontUpdator({
    updator,
    filter
  }, condition, {
    cfClient: new DummyClient() as any as AWS.CloudFront
  })
  it('should nothing to do', async () => {
    const dist = {} as AWS.CloudFront.Distribution
    await expect(client.updateDistribution(dist)).resolves.toBe(undefined)
  })
  it('should update', async () => {
    client = new CloudFrontUpdator({
      updator: ({id}, conf) => {
        console.log(id)
        conf.HttpVersion = 'http2'
        return conf
      },
      filter
    }, condition, {
      cfClient: new DummyClient() as any as AWS.CloudFront
    })
    const dist = {
      Id: 'ETEST'
    } as AWS.CloudFront.Distribution
    await expect(client.updateDistribution(dist)).resolves.toBe(undefined)
  })
  it('should update', async () => {
    client = new CloudFrontUpdator({
      updator: ({id}, conf) => {
        console.log(id)
        conf.Enabled = false
        conf.HttpVersion = 'http2'
        return conf
      },
      filter
    }, {...condition, allowSensitiveAction: true}, {
      cfClient: new DummyClient() as any as AWS.CloudFront
    })
    const dist = {
      Id: 'ETEST'
    } as AWS.CloudFront.Distribution
    await client.updateDistribution(dist)
    expect(JSON.stringify(client.getDiff())).toBe(JSON.stringify({
        "added": {
          "HttpVersion": "http2"
        },
        "deleted": {},
        "updated": {
          "Enabled": false
        }
      }))
  })
  it('should throw error', async () => {
    client = new CloudFrontUpdator({
      updator: ({id}, conf) => {
        console.log(id)
        conf.Enabled = false
        conf.HttpVersion = 'http2'
        return conf
      },
      filter
    }, condition, {
      cfClient: new DummyClient() as any as AWS.CloudFront
    })
    const dist = {
      Id: 'ETEST'
    } as AWS.CloudFront.Distribution
    const promise = client.updateDistribution(dist)
    await expect(promise).rejects.toMatch("You can not allow the action, please set 'allowSensitiveAction' option in the constructor")
  })
})
