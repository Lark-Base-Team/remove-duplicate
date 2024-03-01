import { IField, bitable, FieldType, ITable, IFieldMeta } from "@lark-base-open/js-sdk";
import { MutableRefObject } from "react";
import { ICompareFuncProps, ICompare, CompareType } from "./types";
import { Toast } from "@douyinfe/semi-ui";

/** 第2种比较函数用来缓存的变量  */
let SaveLatestRecordCacheInfo: undefined | {
  /** 除查找字段之外的字段的值列表信息；用于查找记录的完整度 */
  exFieldsValueIdList: {
    /** key为fieldId，值为fieldValueList的recordId数组 */
    [fieldId: string]: string[],

  },
  /** 除查找字段之外的字段实例 */
  fieldListsExFindFields: IField[],
  /** 编辑时间值列表 */
  modifiedFieldValueList: { record_id: string, value: number }[],
  /** 编辑时间字段，比较完成之后需要删掉 */
  modifiedField: IField | undefined

} = undefined

/** 每次选择第2种比较函数的时候清空上一次的比较信息 */
export function initChoose2CacheInfo() {
  SaveLatestRecordCacheInfo = undefined;
}

/**
 * 第2种比较函数
 *  比较2行(findFields除外)，
 *     - 字段完整度高的保留（即各个字段不为空），完整度低的被选中
 *     - 字段完整度一样的，保留最新的一条数据
 */
export async function chooseLatestRecord(info: ICompareFuncProps) {
  if (!SaveLatestRecordCacheInfo) {
    SaveLatestRecordCacheInfo = {
      exFieldsValueIdList: {},
      fieldListsExFindFields: [],
      modifiedFieldValueList: [],
      modifiedField: undefined
    }
  }

  const { choosedFieldIds, table, fieldList, fieldMetaList, toDelModifiedField, recordA, recordB } = info;

  if (!SaveLatestRecordCacheInfo?.fieldListsExFindFields?.length) {
    /*** 除了查找字段之外的字段实例 */
    const fieldListsExFindFields = fieldList.filter(({ id }) => {
      if (id && !choosedFieldIds.includes(id)) {
        return true
      }
      return false
    }) || [];
    SaveLatestRecordCacheInfo.fieldListsExFindFields = fieldListsExFindFields
  }

  const fieldListsExFindFields = SaveLatestRecordCacheInfo.fieldListsExFindFields
  /** 字段A和B的完整度 */
  let recordAFieldCount = 0, recordBFieldCount = 0
  if (fieldListsExFindFields?.length && !Object.keys(SaveLatestRecordCacheInfo.exFieldsValueIdList).length) {
    /** 除查找字段之外的字段的值列表；用于比较它们的完整度 */
    await Promise.allSettled(fieldListsExFindFields?.map(async (f) => {
      const valueList = await f.getFieldValueList();
      SaveLatestRecordCacheInfo!.exFieldsValueIdList[f.id] = valueList.map(({ record_id }) => record_id) as any;
      return {
        fieldId: f.id,
        fieldValueList: valueList
      }
    }))
  }

  for (const fieldId in SaveLatestRecordCacheInfo.exFieldsValueIdList) {
    if (Object.prototype.hasOwnProperty.call(SaveLatestRecordCacheInfo.exFieldsValueIdList, fieldId)) {
      const valueIdList = SaveLatestRecordCacheInfo.exFieldsValueIdList[fieldId];
      if (valueIdList.includes(recordA)) {
        recordAFieldCount++
      }
      if (valueIdList.includes(recordB)) {
        recordBFieldCount++
      }
    }
  }
  if (recordAFieldCount !== recordBFieldCount) {
    // 保留字段完整度高的那个，
    if (recordAFieldCount > recordBFieldCount) {
      return {
        keep: recordA,
        discard: recordB
      }
    } else {
      return {
        keep: recordB,
        discard: recordA
      }
    }
  } else {
    try {
      if (!SaveLatestRecordCacheInfo.modifiedFieldValueList?.length) {
        let modifiedFieldId = fieldMetaList.find(({ type }) => {
          return type == FieldType.ModifiedTime
        })?.id
        if (!modifiedFieldId) {
          // @ts-ignore
          modifiedFieldId = await table.addField({
            type: FieldType.ModifiedTime
          });
          toDelModifiedField.current = modifiedFieldId
        }
        const modifiedField = await table.getFieldById(modifiedFieldId as any)
        const modifiedFieldValueList = await modifiedField?.getFieldValueList();
        SaveLatestRecordCacheInfo.modifiedField = modifiedField
        SaveLatestRecordCacheInfo.modifiedFieldValueList = (modifiedFieldValueList || []) as any
      }
      const recordAModifiedTime = SaveLatestRecordCacheInfo.modifiedFieldValueList.find(({ record_id }) => record_id === recordA)?.value || 0;
      const recordBModifiedTime = SaveLatestRecordCacheInfo.modifiedFieldValueList.find(({ record_id }) => record_id === recordB)?.value || 0;
      if (recordAModifiedTime > recordBModifiedTime) {
        return {
          keep: recordA,
          discard: recordB
        }
      } else {
        return {
          keep: recordB,
          discard: recordA
        }
      }
    } catch (error) {
      /** 比较行编辑时间失败，只能随便返回一个 */
      return {
        keep: recordA,
        discard: recordB
      }
    }

  }
}

let saveByNumberTypeFieldCacheInfo: undefined | {
  /** 比较字段的值列表 */
  compareFiledValueList: { [record_id: string]: number } | undefined;
} = undefined

export function initSaveByNumberTypeFieldCache() {
  saveByNumberTypeFieldCacheInfo = undefined
}


/** 
 * 第1种比较方式
 * 根据某个数字类字段的大小关系比较
 *  */
async function saveByNumberTypeField(props: ICompareFuncProps) {
  if (!saveByNumberTypeFieldCacheInfo) {
    saveByNumberTypeFieldCacheInfo = {
      compareFiledValueList: undefined
    }
  }
  const { choosedFieldIds, compareFieldId, table, fieldList, fieldMetaList, toDelModifiedField, recordA, recordB, compareType } = props;
  if (!saveByNumberTypeFieldCacheInfo?.compareFiledValueList) {
    let field: IField | null = null

    switch (compareType) {
      case CompareType.SaveByEarliestCreate:
      case CompareType.SaveByLatestCreate:

        {
          const createTimeField = fieldMetaList.find((v) => v.type === FieldType.CreatedTime)
          if (!createTimeField) {
            const fieldId = await table.addField({ type: FieldType.CreatedTime });
            toDelModifiedField.current = fieldId;
            field = await table.getFieldById(fieldId)
          } else {
            field = await table.getFieldById(createTimeField.id)
          }

          break;
        }

      case CompareType.SaveByOlderEdit:
      case CompareType.SaveByRecentEdit:

        {
          const editTimeField = fieldMetaList.find((v) => v.type === FieldType.ModifiedTime)
          if (!editTimeField) {
            const fieldId = await table.addField({ type: FieldType.ModifiedTime });
            toDelModifiedField.current = fieldId;
            field = await table.getFieldById(fieldId)
          } else {
            field = await table.getFieldById(editTimeField.id)
          }
          break;
        }
      case CompareType.SaveByBiggerField:
      case CompareType.SaveBySmaller:
        {
          field = fieldList.find((f) => f.id === compareFieldId)!
          break;
        }
      default:
        break;
    }

    if (!field) {
      Toast.error('无法找到创建/编辑时间字段');
      initSaveByNumberTypeFieldCache();
      throw '无法找到创建/编辑时间字段，请手动新增创建/编辑时间字段'
    }

    const valuelist = await field.getFieldValueList();
    saveByNumberTypeFieldCacheInfo!.compareFiledValueList = Object.fromEntries(valuelist.map((v) => [v.record_id, v.value]))
  }
  let sortFieldValueList = saveByNumberTypeFieldCacheInfo!.compareFiledValueList
  if (!sortFieldValueList) {
    initSaveByNumberTypeFieldCache();
    throw '比较字段值列表为空'
  }
  let valueA = sortFieldValueList[recordA] || 0;
  let valueB = sortFieldValueList[recordB] || 0;
  if (compareType === CompareType.SaveByEarliestCreate || compareType === CompareType.SaveByOlderEdit || compareType === CompareType.SaveBySmaller) {
    // 保留比较字段较小的
    return {
      keep: valueA < valueB ? recordA : recordB,
      discard: valueA < valueB ? recordB : recordA
    }
  }

  if (compareType === CompareType.SaveByLatestCreate || compareType === CompareType.SaveByRecentEdit || compareType === CompareType.SaveByBiggerField) {
    // 保留比较字段较大的
    return {
      keep: valueA > valueB ? recordA : recordB,
      discard: valueA > valueB ? recordB : recordA
    }
  }

  throw '比较方法暂不支持，请在反馈群里反馈添加'
}





function getFieldAndCompareFuncs(type: string) {
  switch (type) {
    case CompareType.SaveByBiggerField:
    case CompareType.SaveBySmaller:
    case CompareType.SaveByEarliestCreate:
    case CompareType.SaveByLatestCreate:
    case CompareType.SaveByOlderEdit:
    case CompareType.SaveByRecentEdit:
      return {
        compare: saveByNumberTypeField,
        beforeCompare: (callback?: () => any) => { initSaveByNumberTypeFieldCache(); callback?.() },
        afterCompare: (callback?: () => any) => { callback?.() }
      }


    case CompareType.SaveByCompletion:
      return {
        compare: chooseLatestRecord,
        /** 在开始两两比较之前 */
        beforeCompare: (callback?: () => any) => { initChoose2CacheInfo(); callback?.() },
        /** 在结束了查找重复记录之后 */
        afterCompare: (callback?: () => any) => { callback?.() }
      }

    default:
      return {
        compare: chooseLatestRecord,
        /** 在开始两两比较之前 */
        beforeCompare: (callback?: () => any) => { initChoose2CacheInfo(); callback?.() },
        /** 在结束了查找重复记录之后 */
        afterCompare: (callback?: () => any) => { callback?.() }
      }
  }
}

export function getCompareRecords(props: {
  type: CompareType
}): ICompare {
  return getFieldAndCompareFuncs(props.type)
}
