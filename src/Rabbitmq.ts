import * as amqplib from 'amqplib'
import {Channel, Connection} from 'amqplib'
import {Logger} from 'klg-logger'

const logger = new Logger()

export class Rabbitmq {
  conn: Connection
  channel: Channel
  private isActive: boolean
  private url: string
  private prefix: string

  constructor (url: string, prefix?: string) {
    this.url = url
    this.prefix = prefix || ''
    this.isActive = true
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
    if (!this.channel) {
      await this.connect(this.url)
    }
    logger.debug(data)
    await this.channel.assertQueue(queue)
    this.channel.sendToQueue(queue, new Buffer(JSON.stringify(data)), {persistent: true})
  }

  /**
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
}
