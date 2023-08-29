import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { t } from '../fsm';
import { StateMachineEntity } from '../fsm.entity';

enum OrderState {
  draft = 'draft',
  pending = 'pending',
  paid = 'paid',
  shipped = 'shipped',
  completed = 'completed',
}
enum OrderEvent {
  create = 'create',
  pay = 'pay',
  ship = 'ship',
  complete = 'complete',
}

enum OrderItemState {
  draft = 'draft',
  assembly = 'assembly',
  warehouse = 'warehouse',
  shipping = 'shipping',
  delivered = 'delivered',
}
enum OrderItemEvent {
  create = 'create',
  assemble = 'assemble',
  transfer = 'transfer',
  ship = 'ship',
  deliver = 'deliver',
}

@Entity('order')
class Order extends StateMachineEntity({
  status: {
    id: 'orderStatus',
    initial: OrderState.draft,
    transitions: [
      t(OrderState.draft, OrderEvent.create, OrderState.pending),
      t(OrderState.pending, OrderEvent.pay, OrderState.paid),
      t(OrderState.paid, OrderEvent.ship, OrderState.shipped),
      t(OrderState.shipped, OrderEvent.complete, OrderState.completed),
    ],
  },
  itemsStatus: {
    id: 'orderItemsStatus',
    initial: OrderItemState.draft,
    persistContext: true,
    ctx: {
      place: 'My warehouse',
    },
    transitions: [
      t(OrderItemState.draft, OrderItemEvent.create, OrderItemState.assembly),
      {
        from: OrderItemState.assembly,
        event: OrderItemEvent.assemble,
        to: OrderItemState.warehouse,
      },
      {
        from: OrderItemState.warehouse,
        event: OrderItemEvent.transfer,
        to: OrderItemState.warehouse,
        guard(this: Order, context: { place: string }) {
          return context.place !== 'My warehouse';
        },
      },
      t(OrderItemState.warehouse, OrderItemEvent.ship, OrderItemState.shipping),
      t(
        OrderItemState.shipping,
        OrderItemEvent.deliver,
        OrderItemState.delivered,
      ),
    ],
  },
}) {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({
    default: 0,
  })
  price: number;
}

describe('StateMachineEntity', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      name: (Date.now() * Math.random()).toString(16),
      database: ':memory:',
      dropSchema: true,
      entities: [Order],
      logging: ['error', 'warn'],
      synchronize: true,
      type: 'better-sqlite3',
    });

    await dataSource.initialize();
    await dataSource.synchronize();
  });

  afterAll(async () => {
    await dataSource.dropDatabase();
    await dataSource.destroy();
  });

  afterEach(async () => {
    await dataSource.manager.clear(Order);
  });

  it('should be able to create a new entity with default state', async () => {
    const order = new Order();

    await order.save();

    expect(order).toBeDefined();
    expect(order.status.isDraft()).toBe(true);
    expect(order.itemsStatus.isDraft()).toBe(true);
  });

  it('state should change after event', async () => {
    const order = new Order();
    await order.save();

    await order.status.create();

    expect(order.status.isPending()).toBe(true);

    const orderFromDatabase = await dataSource.manager.findOneOrFail(Order, {
      where: {
        id: order.id,
      },
    });

    expect(orderFromDatabase.status.current).toBe(OrderState.pending);
  });

  it('should throw error when transition is not possible', async () => {
    const order = new Order();
    await order.save();

    await expect(order.status.pay()).rejects.toThrowError();
  });

  it('should throw error when transition guard is not passed', async () => {
    const order = new Order();

    await order.save();

    await order.itemsStatus.create();
    await order.itemsStatus.assemble();

    await expect(order.itemsStatus.transfer()).rejects.toThrowError();
  });
});
