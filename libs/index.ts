import 'tslib'
import { CloudFront } from 'aws-sdk'
import sequentialPromise from '@hideokamoto/sequential-promise'
import { detailedDiff } from 'deep-object-diff'

import DistributionSummaryList = CloudFront.DistributionSummaryList
import DistributionSummary = CloudFront.DistributionSummary
import DistributionConfig = CloudFront.DistributionConfig
import Distribution = CloudFront.Distribution

const sleep = async (time = 1000) => {
  return new Promise(resolve => setTimeout(resolve, time))
}

export namespace interfaces {
  // To Write any method to the new CloudFront distribution config
  export type UpdatorFunction = (distributionId: string, distributionConfig: DistributionConfig) => DistributionConfig | null | Promise<DistributionConfig | null>

  // Filter your distribution to find out a expected distributions
  export type FilterCondition = (distribution: Distribution | DistributionSummary) => boolean | Promise<boolean>

  // task type
  export type TaskType = 'parallel' | 'sequential'

  // for constructor, to define worker methods
  export interface Workers {
    updator: UpdatorFunction;
    filter?: FilterCondition;
  }

  // for constructor, to replace worker clients
  export interface Clients {
    cfClient: CloudFront;
    logger: Function;
  }

  // for constructor, to update task config
  export interface Config {
    debugMode: boolean;
    taskType: TaskType;
    // Distributionのdisabledなどの繊細な操作
    allowSensitiveAction: boolean;
  }
}

import UpdatorFunction = interfaces.UpdatorFunction
import FilterCondition = interfaces.FilterCondition
import TaskType = interfaces.TaskType
import Workers = interfaces.Workers
import Clients = interfaces.Clients
import Config = interfaces.Config

const defaultClients: Clients = {
  cfClient: new CloudFront(),
  logger: (...str: string[]) => console.log(...str)
}
const defaultConfig: Config = {
  debugMode: false,
  taskType: 'sequential',
  allowSensitiveAction: false
}
export class CloudFrontUpdator {
  // Logger
  protected log: Function

  // CloudFront API Client (AWS-SDK)
  protected cfClient: CloudFront

  // Run as a debug mode
  protected debugMode: boolean

  // CloudFront config updator
  protected updator: UpdatorFunction

  // Target Distribution filter
  protected filter: FilterCondition = () => true

  // Task type
  protected taskType: TaskType

  // Allow disabled/enabled distribution
  protected allowSensitiveAction: boolean

  // Dry run diff
  protected diff: any = null

  constructor (workers: Workers, config?: Partial<Config>, clientConfigs?: Partial<Clients>) {
    const clients = {
      ...defaultClients,
      ...clientConfigs
    }
    const conf = {
      ...defaultConfig,
      ...config
    }
    this.log = clients.logger
    this.cfClient = clients.cfClient
    this.debugMode = conf.debugMode
    this.updator = workers.updator
    this.taskType = conf.taskType
    this.allowSensitiveAction = conf.allowSensitiveAction
    if (workers.filter) this.filter = workers.filter
  }

  /**
   * Distribution Configを更新する
   * @param distribution
   * @param updator
   */
  protected async updateDistributionConfig (distribution: Distribution | DistributionSummary, retryCount = 0): Promise<{config: DistributionConfig | null; ETag: string}> {
    this.log(`Update Distribution: ${distribution.Id}`)
    try {
      const { DistributionConfig, ETag } = await this.cfClient.getDistributionConfig({
        Id: distribution.Id
      }).promise()
      if (!DistributionConfig) throw new Error('No such distribution')
      if (!ETag) throw new Error('no ETag')
      const beforeConfig = Object.assign({}, DistributionConfig)
      const config = await this.updator(distribution.Id, DistributionConfig)
      if (this.debugMode && config) {
        this.diff = detailedDiff(beforeConfig, config)
      }
      if (!this.allowSensitiveAction && config) {
        if (beforeConfig.Enabled !== config.Enabled) {
          const err = 'You can not allow the action, please set \'allowSensitiveAction\' option in the constructor'
          this.log(err)
          throw err
        }
      }
      return {
        config: await this.updator(distribution.Id, DistributionConfig),
        ETag
      }
    } catch (e) {
      if (e.code === 'Throttling' && retryCount < 2) {
        this.log(`The request has been throttled, so now start to re-request it. retry count: ${retryCount + 1}`)
        await sleep(2000)
        return this.updateDistributionConfig(distribution, retryCount + 1)
      }
      throw e
    }
  }

  /**
   * Just get diff
   */
  public getDiff () {
    return this.diff
  }

  /**
   * Update処理
   * @param distributionId
   * @param ETag
   * @param distributionConfig
   * @param retryCount
   */
  protected async updateCloudFront (distributionId: string, ETag: string, distributionConfig: DistributionConfig, retryCount = 0): Promise<void | any> {
    if (this.debugMode) {
      this.log(this.diff)
      return
    }
    try {
      await this.cfClient.updateDistribution({
        Id: distributionId,
        IfMatch: ETag,
        DistributionConfig: distributionConfig
      }).promise()
      this.log(`Update succeeded: ${distributionId}`)
    } catch (e) {
      if (e.code === 'Throttling' && retryCount < 2) {
        this.log(`The request has been throttled, so now start to re-request it. retry count: ${retryCount + 1}`)
        await sleep(2000)
        return this.updateCloudFront(distributionId, ETag, distributionConfig, retryCount + 1)
      }
      throw e
    }
  }

  /**
   * 対象かどうか判定
   * @param distribution
   */
  protected async isTargetDistribution (distribution: Distribution | DistributionSummary): Promise<boolean> {
    return this.filter(distribution)
  }

  /**
   * CloudFront全件取得
   * @param distributions
   * @param Marker
   */
  protected async listAllDistributions (distributions: DistributionSummaryList = [], Marker?: string): Promise<DistributionSummaryList> {
    const param: CloudFront.ListDistributionsRequest = { MaxItems: '100' }
    this.log(`Marker: ${Marker}`)
    this.log(distributions.length)
    if (Marker) param.Marker = Marker
    const { DistributionList } = await this.cfClient.listDistributions(param).promise()
    if (!DistributionList || !DistributionList.Items) return distributions
    const newLists = [
      ...distributions,
      ...DistributionList.Items
    ]
    if (!DistributionList.NextMarker) return newLists
    return this.listAllDistributions(newLists, DistributionList.NextMarker)
  }

  /**
   * Update specific distribution
   * @param distribution
   */
  public async updateDistribution (distribution: Distribution | DistributionSummary, hasFiltered = false): Promise<void> {
    if (!hasFiltered && !await this.isTargetDistribution(distribution)) return
    const { ETag, config } = await this.updateDistributionConfig(distribution)
    if (!config) {
      this.log(`${distribution.Id} is no update`)
      return
    }
    await this.updateCloudFront(distribution.Id, ETag, config)
  }

  /**
   * Update all distribution
   */
  public async updateAllDistribution (): Promise<void> {
    const distributions = await this.listAllDistributions()
    this.log(`Distirbution Count: ${distributions.length}`)
    let targetNumber = 0
    const filteredFlag = true
    if (this.taskType === 'sequential') {
      await sequentialPromise(distributions, async (distribution) => {
        if (!await this.isTargetDistribution(distribution)) return
        targetNumber += 1
        this.log(`No. ${targetNumber}: ${distribution.Id}`)
        await this.updateDistribution(distribution, filteredFlag)
      })
    } else if (this.taskType === 'parallel') {
      await Promise.all(distributions.map(async (distribution) => {
        if (!await this.isTargetDistribution(distribution)) return
        targetNumber += 1
        await this.updateDistribution(distribution, filteredFlag)
      }))
    }
    this.log(`Update target: ${targetNumber}`)
  }
}

export default CloudFrontUpdator
