import { BaseEntity, Column, getMetadataArgsStorage, ObjectId } from 'typeorm';

import { IStateMachineParameters, StateMachine, IStateMachine } from './fsm';

type AllowedNames = string | number;

type Callback<
  Context extends object,
  T extends Array<unknown> = Array<unknown>,
> =
  | ((context: Context, ...arguments_: T) => Promise<void>)
  | ((context: Context, ...arguments_: T) => void);
type Guard<Context extends object, T extends Array<unknown> = Array<unknown>> =
  | ((context: Context, ...arguments_: T) => boolean)
  | ((context: Context, ...arguments_: T) => Promise<boolean>);

export interface IStateMachineEntityColumnParameters<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends object,
> extends IStateMachineParameters<
    State,
    Event,
    Context,
    Array<{
      from: State;
      event: Event;
      to: State;
      onEnter?: Callback<any>;
      onExit?: Callback<any>;
      guard?: Guard<any>;
    }>
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
  AllowedNames,
  object
>
  ? State extends AllowedNames
    ? State
    : never
  : never;

type ExtractEvent<
  Parameters extends object,
  Column extends keyof Parameters,
> = Parameters[Column] extends IStateMachineEntityColumnParameters<
  AllowedNames,
  infer Event,
  object
>
  ? Event extends AllowedNames
    ? Event
    : never
  : never;

type ExtractContext<
  Parameters extends object,
  Column extends keyof Parameters,
> = Parameters[Column] extends IStateMachineEntityColumnParameters<
  AllowedNames,
  AllowedNames,
  infer Context
>
  ? Context extends object
    ? Context
    : never
  : never;

type BaseStateMachineEntity = BaseEntity & {
  id: number | string | Date | ObjectId;
} & {
  [key: string]: unknown;
};

const buildAfterLoadMethodName = (column: string) =>
  `__${column}FSM__afterLoad` as const;

const buildContextColumnName = (column: string) =>
  `${column}__context` as const;

function initializeStateMachine<
  const State extends AllowedNames,
  const Event extends AllowedNames,
  const Column extends string,
  const Context extends object,
>(
  entity: BaseStateMachineEntity,
  column: Column,
  parameters: IStateMachineEntityColumnParameters<State, Event, Context>,
) {
  const {
    persistContext,
    saveAfterTransition = true,
    transitions,
    ctx,
  } = parameters;

  parameters.transitions = transitions.map((transition) => {
    return {
      ...transition,
      async onExit(context, ...arguments_) {
        // @ts-expect-error - bind entity to transition
        await transition.onExit?.call(entity, context, ...arguments_);

        if (persistContext) {
          entity[buildContextColumnName(column)] = JSON.stringify(context);
        }

        if (saveAfterTransition) {
          await entity.save();
        }
      },
      guard: transition.guard?.bind(entity),
      onEnter: transition.onEnter?.bind(entity),
    };
  });

  let context = typeof ctx === 'string' ? JSON.parse(ctx) : ctx;

  if (
    persistContext &&
    Object.keys(entity[buildContextColumnName(column)] as object).length > 0
  ) {
    context = entity[buildContextColumnName(column)];
  }

  entity[column] = new StateMachine({
    ...parameters,
    initial: entity[column] as State,
    ctx: context,
  });
}

export const StateMachineEntity = function <
  Parameters extends {
    [Column in Columns]: IStateMachineEntityColumnParameters<
      AllowedNames,
      AllowedNames,
      any
    >;
  },
  const Columns extends keyof Parameters = keyof Parameters,
>(parameters: Parameters) {
  class _StateMachineEntity extends BaseEntity {
    id!: BaseStateMachineEntity['id'];
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
          transformer: {
            // we're transforming the value in after-load/after-insert hooks
            from: (value) => value,
            to: (value) => {
              return value?.current ?? initial;
            },
          },
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
    new (): BaseEntity & {
      [Column in keyof Parameters]: IStateMachine<
        ExtractState<Parameters, Column>,
        ExtractEvent<Parameters, Column>,
        ExtractContext<Parameters, Column>
      >;
    };
  };
};
