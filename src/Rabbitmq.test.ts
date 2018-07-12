import {Rabbitmq} from './Rabbitmq'

async function delay (time) {
  return new Promise(resolve => {
    setTimeout(resolve, time)
  })
}

describe('RabbitMQ test', async function () {
  let mq: Rabbitmq

  beforeAll(async function () {
    mq = new Rabbitmq('amqp://joda:5672', 'test:')
  })

  it(' test queue ', async () => {
    const queueName = 'a1'
    const data = {a: 'ssss', b: 233}
    await mq.queue(queueName, data)
    const res = await mq.assertQueue(queueName)
    expect(res)
    expect(res.queue).toEqual(queueName)
  })

  it(' test consume ', (done) => {
    const queueName = 'a1'
    mq.consumeSingleQueue(queueName, 2, async function (data) {
      expect(data).toEqual({a: 'ssss', b: 233})
      done()
    })
  })


  it(' test consume error', async () => {
    const queueName = 'a233'
    const data = {a: 'ssss', b: 233}
    await mq.queue(queueName, data)

    mq.consumeSingleQueue(queueName, 2, async function (data) {
      throw new Error('内部错误')
    })

    await delay(1000)
    const res = await mq.assertQueue(queueName)
    expect(res)
    expect(res.queue).toEqual(queueName)
    expect(res.messageCount).toEqual(0)
  })


  it(' test disable ', async () => {
    const queueName = 'a233345'
    const data = {a: 'ssss3444', b: 233}
    const spy = jest.fn()
    mq.disable()
    await mq.queue(queueName, data)
    mq.consumeSingleQueue(queueName, 1, async function (data) {
      spy(data)
    })
    await delay(200)
    expect(spy).toHaveBeenCalledTimes(0)
    mq.active()
    await delay(100)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toBeCalledWith(data)
  })

  afterAll(async function () {
    await mq.channel.ackAll()
    await mq.channel.close()
    await mq.conn.close()
  })
})
