import {
  Column,
  DataSource,
  Entity,
  PrimaryGeneratedColumn,
  BaseEntity as TypeOrmBaseEntity,
} from 'typeorm';

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

interface IOrderItemContext {
  place: string;
}

class BaseEntity extends TypeOrmBaseEntity {
  @PrimaryGeneratedColumn()
  id: string;
}

@Entity('order')
class Order extends StateMachineEntity(
  {
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
        t(
          OrderItemState.assembly,
          OrderItemEvent.assemble,
          OrderItemState.warehouse,
        ),
        {
          from: OrderItemState.warehouse,
          event: OrderItemEvent.transfer,
          to: OrderItemState.warehouse,
          guard(context: IOrderItemContext, place: string) {
            return context.place !== place;
          },
          onExit(context: IOrderItemContext, place: string) {
            context.place = place;
          },
        },
        t(
          [OrderItemState.assembly, OrderItemState.warehouse],
          OrderItemEvent.ship,
          OrderItemState.shipping,
        ),
        t(
          OrderItemState.shipping,
          OrderItemEvent.deliver,
          OrderItemState.delivered,
        ),
      ],
    },
  },
  BaseEntity,
) {
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

  it('should be able to pass correct contexts (this and ctx) to subscribers', async () => {
    const order = new Order();
    await order.save();

    let handlerContext!: Order;
    const handler = jest.fn().mockImplementation(function (
      this: Order,
      _context: IOrderItemContext,
    ) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment
      handlerContext = this;
    });

    order.itemsStatus.on(OrderItemEvent.create, handler);

    await order.itemsStatus.create();

    expect(handlerContext).toBeInstanceOf(Order);
    expect(handler).toBeCalledTimes(1);
    expect(handler).toBeCalledWith({ place: 'My warehouse' });
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

    await order.itemsStatus.transfer('John warehouse');

    await expect(
      order.itemsStatus.transfer('John warehouse'),
    ).rejects.toThrowError();
  });
});
