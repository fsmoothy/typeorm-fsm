import {
  IStateMachineParameters,
  StateMachine,
  IStateMachine,
  ITransition,
} from 'fsmoothy';
import { StateMachineError } from 'fsmoothy/fsm.error';
import { AllowedNames } from 'fsmoothy/types';
import { BaseEntity, Column, getMetadataArgsStorage, ObjectId } from 'typeorm';

export interface IStateMachineEntityColumnParameters<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends object,
> extends IStateMachineParameters<
    State,
    Event,
    Context,
    ITransition<State, Event, any>,
    [ITransition<State, Event, any>, ...Array<ITransition<State, Event, any>>]
  > {
  persistContext?: boolean;
  /**
   * @default true
   */
  saveAfterTransition?: boolean;
}

type ExtractState<
  Parameters extends object,
  Column extends keyof Parameters,
> = Parameters[Column] extends IStateMachineEntityColumnParameters<
  infer State,
  any,
  any
>
  ? State extends AllowedNames
    ? State
    : never
  : never;

type ExtractEvent<
  Parameters extends object,
  Column extends keyof Parameters,
> = Parameters[Column] extends IStateMachineEntityColumnParameters<
  any,
  infer Event,
  any
>
  ? Event extends AllowedNames
    ? Event
    : never
  : never;

type ExtractContext<
  Parameters extends object,
  Column extends keyof Parameters,
> = Parameters[Column] extends IStateMachineEntityColumnParameters<
  any,
  any,
  infer Context
>
  ? Context extends object
    ? Context
    : never
  : never;

type BaseStateMachineEntity<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends object,
  Column extends string,
> = BaseEntity & {
  id: number | string | Date | ObjectId;
} & {
  [key: string]: unknown;
} & {
  fsm: {
    [column in Column]: IStateMachine<State, Event, Context>;
  };
};

const buildAfterLoadMethodName = (column: string) =>
  `__${column}FSM__afterLoad` as const;

const buildContextColumnName = (column: string) =>
  `__${column}FSM__context` as const;

function initializeStateMachine<
  const State extends AllowedNames,
  const Event extends AllowedNames,
  const Column extends string,
  const Context extends object,
>(
  entity: BaseStateMachineEntity<State, Event, Context, Column>,
  column: Column,
  parameters: IStateMachineEntityColumnParameters<State, Event, Context>,
) {
  const {
    persistContext,
    saveAfterTransition = true,
    transitions,
    ctx,
  } = parameters;

  if (!Array.isArray(transitions) || transitions.length === 0) {
    throw new StateMachineError('Transitions are not defined');
  }

  // @ts-expect-error - we're using variadic tuple
  parameters.transitions = transitions.map((transition) => {
    return {
      ...transition,
      async onExit(context, ...arguments_) {
        await transition.onExit?.(context, ...arguments_);

        entity[column] = transition.to as State;

        if (persistContext) {
          entity[buildContextColumnName(column)] = JSON.stringify(context);
        }

        if (saveAfterTransition) {
          await entity.save();
        }
      },
    };
  });

  let context = typeof ctx === 'string' ? JSON.parse(ctx) : ctx;

  if (
    persistContext &&
    Object.keys(entity[buildContextColumnName(column)] as object).length > 0
  ) {
    context = entity[buildContextColumnName(column)];
  }

  if (typeof context !== 'function') {
    context = () => context;
  }

  entity.fsm[column] = new StateMachine({
    ...parameters,
    initial: entity[column] as State,
    ctx: context,
  });

  entity.fsm[column].bind(entity);
}

/**
 * Mixin to extend your entity with state machine. Extends BaseEntity.
 * @param parameters - state machine parameters
 * @param _BaseEntity - base entity class to extend from
 *
 * @example
 * import { StateMachineEntity, t } from 'typeorm-fsm';
 *
 * enum OrderState {
 *   draft = 'draft',
 *   pending = 'pending',
 *   paid = 'paid',
 *   completed = 'completed',
 * }
 *
 * enum OrderEvent {
 *   create = 'create',
 *   pay = 'pay',
 *   complete = 'complete',
 * }
 *
 * @Entity()
 * class Order extends StateMachineEntity({
 *   status: {
 *     id: 'orderStatus',
 *     initial: OrderState.draft,
 *   transitions: [
 *     t(OrderState.draft, OrderEvent.create, OrderState.pending),
 *     t(OrderState.pending, OrderEvent.pay, OrderState.paid),
 *     t(OrderState.paid, OrderEvent.complete, OrderState.completed),
 *   ],
 * }}) {}
 */
export const StateMachineEntity = function <
  const Parameters extends {
    [Column in Columns]: IStateMachineEntityColumnParameters<any, any, any>;
  },
  Entity extends BaseEntity,
  const Columns extends keyof Parameters = keyof Parameters,
>(parameters: Parameters, _BaseEntity?: { new (): Entity }) {
  const _Entity = _BaseEntity ?? BaseEntity;

  class _StateMachineEntity extends _Entity {
    constructor() {
      super();
      Object.defineProperty(this, 'fsm', {
        value: {},
        writable: true,
        enumerable: false,
      });
    }
  }

  const metadataStorage = getMetadataArgsStorage();

  for (const [column, parameter] of Object.entries<
    IStateMachineEntityColumnParameters<AllowedNames, AllowedNames, object>
  >(
    parameters as unknown as Record<
      Columns,
      IStateMachineEntityColumnParameters<AllowedNames, AllowedNames, object>
    >,
  )) {
    const { persistContext, initial } = parameter;
    const afterLoadMethodName = buildAfterLoadMethodName(column);

    Object.defineProperty(_StateMachineEntity.prototype, afterLoadMethodName, {
      value: function () {
        initializeStateMachine(this, column, parameter);
      },
    });

    Object.defineProperty(_StateMachineEntity.prototype, column, {
      value: undefined,
      writable: true,
    });

    Reflect.decorate(
      [
        Column('text', {
          default: initial,
        }),
      ],
      _StateMachineEntity.prototype,
      column,
    );
    Reflect.metadata('design:type', String)(
      _StateMachineEntity.prototype,
      column,
    );

    if (persistContext) {
      const contextColumnName = buildContextColumnName(column);
      Object.defineProperty(_StateMachineEntity.prototype, contextColumnName, {
        value: {},
        writable: true,
      });

      Reflect.decorate(
        [
          Column({
            type: 'text',
            default: '{}',
            transformer: {
              from(value) {
                if (typeof value === 'string') {
                  return JSON.parse(value);
                }

                return value;
              },
              to(value) {
                return JSON.stringify(value);
              },
            },
          }),
        ],
        _StateMachineEntity.prototype,
        contextColumnName,
      );
    }

    metadataStorage.entityListeners.push(
      {
        target: _StateMachineEntity,
        propertyName: afterLoadMethodName,
        type: 'after-load',
      },
      {
        target: _StateMachineEntity,
        propertyName: afterLoadMethodName,
        type: 'after-insert',
      },
    );
  }

  return _StateMachineEntity as unknown as {
    new (): BaseEntity &
      Entity & {
        params: Parameters;
        fsm: {
          [Column in keyof Parameters]: IStateMachine<
            ExtractState<Parameters, Column>,
            ExtractEvent<Parameters, Column>,
            ExtractContext<Parameters, Column>
          >;
        };
      } & {
        [Column in keyof Parameters]: ExtractState<Parameters, Column>;
      };
  };
};
