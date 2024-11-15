import { IFieldMeta as FieldMeta, IField, ITable, ITableMeta, bitable, FieldType, IFilterInfo, FilterOperator, FilterConjunction, IGridView, IFieldMeta, IOpenCellValue } from "@lark-base-open/js-sdk";
import { MutableRefObject } from "react";

/** 找出来需要被删除的那些，key为字段值的json格式 */
export interface ToDelete {
  /** 找出来需要被删除的那些，key为字段值的json格式  */
  [p: string]: string[];
}
/** 找出来需要被保留的那个，key为字段值的json格式 */
export interface Existing {
  /** 找出来需要被保留的那个,key为字段值的json格式  */
  [p: string]: string;
}

/** 当前table级的信息 */
export interface TableInfo {
  /** 当前所选的table,默认为打开插件时的table */
  table: ITable;
  /** 当前所选table的元信息 */
  tableMeta: ITableMeta;
  /** 所有的table元信息 */
  tableMetaList: ITableMeta[];
  /** 所有table的实例 */
  tableList: ITable[];
}

/** 当前table所有field信息 */
export interface FieldInfo {
  /**当前所选field的实例 */
  field: IField | undefined;
  /** 当前所选field的元信息 */
  fieldMeta: FieldMeta | undefined;
  /** tableInfo.table的所有field实例 */
  fieldList: IField[];
  /** tableInfo.table的所有field元信息 */
  fieldMetaList: FieldMeta[];
}

/** 表单所选的字段相关信息 */
export interface FormFields {
  /** 用来排序的那个field的相关信息 */
  sortFieldValueList: {
    field: IField;
    fieldMeta: FieldMeta;
    valueList: Map<string, {
      [fieldId: string]: IOpenCellValue;
    }>;
  };
  /** 查找字段值那些列的相关信息 */
  identifyingFieldsValueList: {
    field: IField;
    fieldMeta: FieldMeta;
    valueList: Map<string, {
      [fieldId: string]: IOpenCellValue;
    }>;
  }[];
}

export interface ICompare {
  compare: (info: ICompareFuncProps) => Promise<{
    keep: string;
    discard: string;
  }>,
  beforeCompare: (c?: () => any) => void;
  afterCompare: (c?: () => any) => void
}

export enum CompareType {
  /** 保留字段完整度高的那个， */
  SaveByCompletion = 'save_by_completion',
  /**
   * 保留最早创建的
   */
  SaveByEarliestCreate = 'save_by_earliest_create',

  /**
   * 保留最近创建的
   */
  SaveByLatestCreate = 'save_by_latest_create',

  /**
   * 保留最近编辑的
   */
  SaveByRecentEdit = 'save_by_recent_edit',

  /**
   * 保留较旧的编辑
   */
  SaveByOlderEdit = 'save_by_older_edit',

  /** 保留自定义字段较大的 */
  SaveByBiggerField = 'save_by_bigger_field',
  /** 保留自定义字段较小的 */
  SaveBySmaller = 'save_by_smaller'
}


export interface ICompareFuncProps {
  /** 比较的当前的记录id */
  recordA: string,
  /** 比较的已经存在的记录id */
  recordB: string,
  table: ITable,
  /** n个查找字段，用这些字段来判断2行记录是否重复 */
  choosedFieldIds: string[],
  fieldList: IField[],
  fieldMetaList: IFieldMeta[],
  /** 为了比较而临时产生的字段，需要在比较结束后删除 */
  toDelModifiedField: MutableRefObject<string | undefined>,
  compareType: CompareType,
  /** 自定义比较字段 */
  compareFieldId: string,
  recordsValue: Map<string, {
    [fieldId: string]: IOpenCellValue;
  }>
}