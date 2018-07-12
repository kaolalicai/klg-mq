# klg-mq
rabbitmq 连接工具

## QuickStart

```js
// 初始化
const mq = new Rabbitmq('amqp://joda:5672', 'test:')

// 发送消息
const queueName = 'a1'
const data = {a: 'ssss', b: 233}
await mq.queue(queueName, data)

// 消费(异步)
const prefetch = 2 // 消费速率
mq.consumeSingleQueue(queueName, prefetch, async function (data) {
  expect(data).toEqual({a: 'ssss', b: 233})
  done()
})

// 暂停消费 一般用于服务平滑重启
mq.disable()

// 重新激活
mq.active()

```

### Test
没有做 mq mock，所以需要 mq 服务，开启 mq 服务，然后修改测试文件 Rabbitmq.test.ts 里 初始化连接的 url

```bash
$ npm i
$ npm test
```

