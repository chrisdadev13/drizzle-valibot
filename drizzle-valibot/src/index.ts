import {
  type Assume,
  type Column,
  type DrizzleTypeError,
  type Equal,
  getTableColumns,
  is,
  type Simplify,
  type Table,
} from "drizzle-orm";
import {
  MySqlChar,
  MySqlVarBinary,
  MySqlVarChar,
} from "drizzle-orm/mysql-core";
import { type PgArray, PgChar, PgUUID, PgVarchar } from "drizzle-orm/pg-core";
import { SQLiteText } from "drizzle-orm/sqlite-core";
import * as v from "valibot";
import {
  ArraySchema,
  AnySchema,
  BigintSchema,
  BooleanSchema,
  DateSchema,
  LiteralSchema,
  NullSchema,
  ObjectSchema,
  OptionalSchema,
  BaseSchema,
  StringSchema,
  UnionSchema,
  EnumSchema,
  NumberSchema,
} from "valibot";

const literalSchema = v.union([
  v.string(),
  v.number(),
  v.boolean(),
  v.nullType(),
]);

type Literal = v.Input<typeof literalSchema>;

//type Json = Literal | { [key: string]: Json } | Json[];
type Json = typeof jsonSchema;

export const jsonSchema = v.union([
  literalSchema,
  v.array(v.any()),
  v.record(v.string(), v.any()),
]);

type MapInsertColumnToValibot<
  TColumn extends Column,
  TType extends AnySchema
> = TColumn["_"]["notNull"] extends false
  ? OptionalSchema<v.NullSchema<TType>>
  : TColumn["_"]["hasDefault"] extends true
  ? OptionalSchema<TType>
  : TType;

type MapSelectColumnToValibot<
  TColumn extends Column,
  TType extends AnySchema
> = TColumn["_"]["notNull"] extends false ? NullSchema<TType> : TType;

type MapColumnToValibot<
  TColumn extends Column,
  TType extends AnySchema,
  TMode extends "insert" | "select"
> = TMode extends "insert"
  ? MapInsertColumnToValibot<TColumn, TType>
  : MapSelectColumnToValibot<TColumn, TType>;

type MaybeOptional<
  TColumn extends Column,
  TType extends AnySchema,
  TMode extends "insert" | "select",
  TNoOptional extends boolean
> = TNoOptional extends true
  ? TType
  : MapColumnToValibot<TColumn, TType, TMode>;

type GetValibotType<TColumn extends Column> =
  TColumn["_"]["dataType"] extends infer TDataType
    ? TDataType extends "custom"
      ? AnySchema
      : TDataType extends "json"
      ? Json
      : TColumn extends { enumValues: [string, ...string[]] }
      ? Equal<TColumn["enumValues"], [string, ...string[]]> extends true
        ? StringSchema
        : EnumSchema<TColumn["enumValues"]>
      : TDataType extends "array"
      ? ArraySchema<
          GetValibotType<
            Assume<TColumn["_"], { baseColumn: Column }>["baseColumn"]
          >
        >
      : TDataType extends "bigint"
      ? BigintSchema
      : TDataType extends "number"
      ? NumberSchema
      : TDataType extends "string"
      ? StringSchema
      : TDataType extends "boolean"
      ? BooleanSchema
      : TDataType extends "date"
      ? DateSchema
      : AnySchema
    : never;

type ValueOrUpdater<T, TUpdateArg> = T | ((arg: TUpdateArg) => T);

type UnwrapValueOrUpdater<T> = T extends ValueOrUpdater<infer U, any>
  ? U
  : never;

export type Refine<TTable extends Table, TMode extends "select" | "insert"> = {
  [K in keyof TTable["_"]["columns"]]?: ValueOrUpdater<
    AnySchema,
    TMode extends "select"
      ? BuildSelectSchema<TTable, {}, true>
      : BuildInsertSchema<TTable, {}, true>
  >;
};

export type BuildInsertSchema<
  TTable extends Table,
  TRefine extends Refine<TTable, "insert"> | {},
  TNoOptional extends boolean = false
> = TTable["_"]["columns"] extends infer TColumns extends Record<
  string,
  Column<any>
>
  ? {
      [K in keyof TColumns & string]: MaybeOptional<
        TColumns[K],
        K extends keyof TRefine
          ? Assume<UnwrapValueOrUpdater<TRefine[K]>, AnySchema>
          : GetValibotType<TColumns[K]>,
        "insert",
        TNoOptional
      >;
    }
  : never;

export type BuildSelectSchema<
  TTable extends Table,
  TRefine extends Refine<TTable, "select">,
  TNoOptional extends boolean = false
> = Simplify<{
  [K in keyof TTable["_"]["columns"]]: MaybeOptional<
    TTable["_"]["columns"][K],
    K extends keyof TRefine
      ? Assume<UnwrapValueOrUpdater<TRefine[K]>, AnySchema>
      : GetValibotType<TTable["_"]["columns"][K]>,
    "select",
    TNoOptional
  >;
}>;
