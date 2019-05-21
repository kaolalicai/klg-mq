import {Rabbitmq} from './Rabbitmq'

async function delay (time) {
  return new Promise(resolve => {
    setTimeout(resolve, time)
  })
}

describe('Rabbitmq.batch.test', async function () {
  let mq: Rabbitmq
  let total = 22
  let executeTimes = 0
  let executeCount = 0

  beforeAll(async function () {
    mq = new Rabbitmq('amqp://joda:5672', 'test:')
  })

  it(' test queue ', async () => {
    const queueName = 'a1'
    for (let i = 0; i < total; i++) {
      await mq.queue(queueName, {a: 'ssss', b: i})
    }
    const res = await mq.assertQueue(queueName)
    expect(res)
    expect(res.queue).toEqual(queueName)
  })

  it(' test consume batch', async () => {
    const queueName = 'a1'
    const batchSize = 10
    await mq.consumeBatch(queueName, batchSize, async function (list) {
      console.log('list', list)
      expect(list)
      expect(list.length <= batchSize)
      executeTimes++
      executeCount += list.length
    }, 1000)

    await delay(1500)
    expect(executeTimes).toEqual(Math.ceil(total / batchSize))
    expect(executeCount).toEqual(total)
  })

  afterAll(async function () {
    await mq.channel.ackAll()
    await mq.channel.close()
    await mq.conn.close()
  })
})
