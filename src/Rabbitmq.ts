import * as amqplib from 'amqplib'
import {Channel, Connection} from 'amqplib'
import {Logger} from 'klg-logger'

const logger = Logger()

export class Rabbitmq {
  conn: Connection
  channel: Channel
  private isActive: boolean
  private url: string
  private prefix: string
  private dataQueue: Map<string, Array<any>>
  private registerTimeout: boolean

  constructor (url: string, prefix?: string) {
    this.url = url
    this.prefix = prefix || ''
    this.isActive = true
    this.dataQueue = new Map()
    this.connect(url).then(function () {
      logger.info('rabbitmq is ready')
    }).catch(logger.error)
  }

  disable () {
    this.isActive = false
  }

  active () {
    this.isActive = true
  }

  /**
   * 检查队列是否存在
   */
  async assertQueue (queue: string) {
    return await this.channel.assertQueue(queue)
  }

  /**
   * 排队
   */
  async queue (queue: string, data: object) {
    queue = this.prefix + queue
    await this.checkChannel()
    logger.debug(data)
    await this.channel.assertQueue(queue)
    this.channel.sendToQueue(queue, new Buffer(JSON.stringify(data)), {persistent: true})
  }

  /**
   * 批量消费
   * 依赖内存队列，可能有内存泄露风险
   * @param queue
   * @param batchSize 集齐 batchSize 个数后才调用 handle 消费
   * @param handle
   * @param timeout
   */
  async consumeBatch (queue: string, batchSize: number, handle: (data: Array<any>) => any, timeout: number) {
    const that = this
    await this.checkChannel()
    await this.assertQueue(queue)

    await this.consumeSingle(queue, 1, fetch)

    async function fetch (json) {
      await pushToQueue(queue, json)
      finallyCommit()
    }

    async function pushToQueue (queue, data) {
      if (!that.dataQueue.get(queue)) {
        that.dataQueue.set(queue, [])
      }
      that.dataQueue.get(queue).push(data)
      if (that.dataQueue.get(queue).length >= batchSize) {
        await commit(queue)
      }
    }

    function finallyCommit () {
      if (that.registerTimeout) return
      setTimeout(() => {
        commit(queue).catch(logger.error)
        that.registerTimeout = false
      }, timeout)
      that.registerTimeout = true
    }

    async function commit (queue) {
      const list = that.dataQueue.get(queue)
      that.dataQueue.set(queue, [])
      if (list && list.length) {
        await handle(list)
      }
    }
  }

  /**
   * 消费
   * @param queue
   * @param prefetch
   * @param handle
   */
  async consumeSingle (queue: string, prefetch: number, handle: (data: object) => any) {
    queue = this.prefix + queue
    const channel = this.channel
    logger.info(`consume queue ${queue}, prefetch ${prefetch}`)
    await channel.assertQueue(queue)
    await channel.prefetch(prefetch)
    await channel.consume(queue, (msg) => {
      if (!this.isActive) {
        // 100 ms 才 reject，避免 mq，不然 mq 会一直consume + reject
        setTimeout(() => {
          channel.reject(msg)
        }, 100)
        return
      }
      if (!msg) {
        logger.error(`${queue} consume msg null`)
        return
      }
      let json
      try {
        json = JSON.parse(msg.content.toString())
      } catch (err) {
        logger.error(err)
        return
      }
      // 执行函数
      handle(json).then(function () {
        channel.ack(msg)
      }).catch(function (err) {
        // 同步返回错误也直接ack, 然后处理下一个
        logger.error('mq consume error ', err)
        channel.ack(msg)
      })
    })
  }

  /**
   * @deprecated
   * 消费单个队列的消息
   */
  consumeSingleQueue (queue, prefetch, handle: (data: object) => any) {
    queue = this.prefix + queue
    const channel = this.channel
    logger.info(`consume queue ${queue}, prefetch ${prefetch}`)
    channel.assertQueue(queue).then(() => {
      channel.prefetch(prefetch)
      channel.consume(queue, (msg) => {
        if (!this.isActive) {
          // 100 ms 才 reject，避免 mq，不然 mq 会一直consume + reject
          setTimeout(() => {
            channel.reject(msg)
          }, 100)
          return
        }
        if (!msg) {
          logger.error(`${queue} consume msg null`)
          return
        }
        let json
        try {
          json = JSON.parse(msg.content.toString())
        } catch (err) {
          logger.error(err)
          return
        }
        // 执行函数
        handle(json).then(function () {
          channel.ack(msg)
        }).catch(function (err) {
          // 同步返回错误也直接ack, 然后处理下一个
          logger.error('mq consume error ', err)
          channel.ack(msg)
        })
      }).catch(logger.error)
    }).catch(logger.error)
  }

  private async connect (url) {
    this.conn = await amqplib.connect(url)
    this.channel = await this.conn.createChannel()
  }

  private async checkChannel () {
    if (!this.channel) {
      await this.connect(this.url)
    }
  }
}
