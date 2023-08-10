import { IFieldMeta as FieldMeta, IWidgetField, IWidgetTable, TableMeta, bitable, FieldType } from "@base-open/web-api";
import { useEffect, useState, useRef, useMemo } from "react";
import { Form, Toast, Spin, Tooltip, Button, Col, Row } from "@douyinfe/semi-ui";
import { IconHelpCircle, IconPlus, IconMinus, IconClose } from "@douyinfe/semi-icons";
import DelTable from "./table";
import { useTranslation } from 'react-i18next';









/** 表格，字段变化的时候刷新插件 */
export default function Ap() {
  const [key, setKey] = useState<string | number>(0);
  const [tableList, setTableList] = useState<IWidgetTable[]>([]);
  // 绑定过的tableId
  const bindList = useRef<Set<string>>(new Set());

  const refresh = useMemo(
    () => () => {
      const t = new Date().getTime();
      setKey(t);
    },
    []
  );

  useEffect(() => {
    bitable.base.getTableList().then((list) => {
      setTableList(list);
    });
    const deleteOff = bitable.base.onTableDelete(() => {
      setKey(new Date().getTime());
    });
    const addOff = bitable.base.onTableAdd(() => {
      setKey(new Date().getTime());
      bitable.base.getTableList().then((list) => {
        setTableList(list);
      });
    });
    return () => {
      deleteOff();
      addOff();
    };
  }, []);

  // useEffect(() => {
  //     if (tableList.length) {
  //         tableList.forEach((table) => {
  //             if (bindList.current.has(table.id)) {
  //                 return;
  //             }
  //             table.onFieldAdd(refresh);
  //             table.onFieldDelete(refresh);
  //             table.onFieldModify(refresh);
  //             bindList.current.add(table.id);
  //         });
  //     }
  // }, [tableList]);

  return <T key={key}></T>;
}

/** 如f-12345678 */
function getLast8Digits() {
  let timestamp = new Date().getTime();
  // 获取时间戳的字符串形式
  const timestampString = timestamp.toString();
  // 获取时间戳字符串的最后6位，如果不足6位则返回整个字符串
  const last8Digits = timestampString.slice(-8);
  return "f-" + last8Digits;
}

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
  table: IWidgetTable;
  /** 当前所选table的元信息 */
  tableMeta: TableMeta;
  /** 所有的table元信息 */
  tableMetaList: TableMeta[];
  /** 所有table的实例 */
  tableList: IWidgetTable[];
}

/** 当前table所有field信息 */
export interface FieldInfo {
  /**当前所选field的实例 */
  field: IWidgetField | undefined;
  /** 当前所选field的元信息 */
  fieldMeta: FieldMeta | undefined;
  /** tableInfo.table的所有field实例 */
  fieldList: IWidgetField[];
  /** tableInfo.table的所有field元信息 */
  fieldMetaList: FieldMeta[];
}

/** 表单所选的字段相关信息 */
export interface FormFields {
  /** 用来排序的那个field的相关信息 */
  sortFieldValueList: {
    field: IWidgetField;
    fieldMeta: FieldMeta;
    valueList: any[];
  };
  /** 查找字段值那些列的相关信息 */
  identifyingFieldsValueList: {
    field: IWidgetField;
    fieldMeta: FieldMeta;
    valueList: any[];
  }[];
}

function T() {
  const [windowWidth, setWindowWidth] = useState(document.body.clientWidth);
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<ToDelete>();
  const [existing, setExisting] = useState<Existing>();

  // 传给table的props，
  const [fieldsValueLists, setFieldsValueLists] = useState<FormFields>();
  const [, f] = useState<any>();

  const updateCom = () => f({});
  //用来数filed的，控制新增/删除查找字段
  const count = useRef<Set<string>>(new Set([]));

  /** toDelete中的所有recordId */
  const toDeleteRecordIds = useRef<string[]>([]);

  const [tableInfo, setTableInfo] = useState<TableInfo>();
  const [fieldInfo, setFieldInfo] = useState<FieldInfo>();

  /** 临时新增的字段，比较完成之后删掉它 */
  const toDelModifiedField = useRef<string>()

  /** 第2种比较函数用来缓存的变量  */
  const choose2CacheInfo = useRef<{
    /** 除查找字段之外的字段的值列表信息；用于查找字段的 */
    exFieldsValueIdList: {
      /** key为fieldId，值为fieldValueList的recordId数组 */
      [fieldId: string]: string[],

    },
    /** 除查找字段之外的字段实例 */
    fieldListsExFindFields: IWidgetField[],
    /** 编辑时间值列表 */
    modifiedFieldValueList: { record_id: string, value: number }[],
    /** 编辑时间字段，比较完成之后需要删掉 */
    modifiedField: IWidgetField | undefined

  }>()

  const formApi = useRef<any>();

  useEffect(() => {
    let timer: any;
    const resize = () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        setWindowWidth(document.body.clientWidth);
      }, 100);
    };
    window.onresize = resize;
  }, []);

  useEffect(() => {
    async function init() {
      const selection = await bitable.base.getSelection();
      if (selection.tableId) {
        const [tableRes, tableMetaListRes, tableListRes] = await Promise.all([
          bitable.base.getTableById(selection.tableId),
          bitable.base.getTableMetaList(),
          bitable.base.getTableList(),
        ]);
        setTableInfo({
          table: tableRes,
          tableMeta: tableMetaListRes.find(({ id }) => tableRes.id === id)!,
          tableMetaList: tableMetaListRes.filter(({ name }) => name),
          tableList: tableListRes,
        });
        // 清空其他选项
        formApi.current.setValues({ table: tableRes.id });

        const fieldMetaList = await tableRes.getFieldMetaList();
        const fieldList = await tableRes.getFieldList();
        setFieldInfo({
          fieldList,
          fieldMetaList,
          field: undefined,
          fieldMeta: undefined,
        });
      }
    }
    init();
  }, []);

  const del = async () => {
    let { field3, ...restFields } = formApi.current.getValues();
    let keys = Object.keys(restFields);

    if (!(keys.length
      // && field3
    )) {
      Toast.error(t("select.field.1"));
      return;
    }
    choose2CacheInfo.current = undefined
    setLoading(true);
    setTimeout(async () => {
      let { table, field3, ...restFields } = formApi.current.getValues();
      restFields = JSON.parse(JSON.stringify(restFields));
      let keys = Object.keys(restFields);
      if (!field3) {
        // 第1种比较字段的方式,默认值
        field3 = restFields[keys[0]]
      }
      let existing = Object.create(null);
      let toDelete: ToDelete = {};
      toDeleteRecordIds.current = [];

      /** 所有查找字段实例 */
      const findFields = keys
        .map((f) => fieldInfo?.fieldList.find(({ id }) => id === restFields[f]))
        .filter((v) => v);
      const currentFieldsMetas = (await tableInfo?.table.getFieldMetaList()) || [];
      const currentFieldIds = currentFieldsMetas.map(({ id }) => id)
      if (findFields.some((f) => {
        return !currentFieldIds.includes(f?.id as any)
      })) {
        setLoading(false);
        Toast.error(t('field.err.5'));
        setFieldInfo({
          ...fieldInfo,
          fieldMetaList: currentFieldsMetas,
        } as any);
        for (const formId in restFields) {
          if (Object.prototype.hasOwnProperty.call(restFields, formId)) {
            const formIdValue = restFields[formId];
            if (!currentFieldIds.includes(formIdValue)) {
              formApi.current.setValue(formId, undefined)
            }
          }
        }
        return
      }
      /** field3 用来比较的字段 */
      const sortField = fieldInfo?.fieldList.find(({ id }) => id === field3)! || fieldInfo?.fieldList[0];
      //sortFieldValueList:field3，用来比较的字段的值列表, identifyingFieldsValueList：其余查找字段值列表数组
      const [sortFieldValueList, ...identifyingFieldsValueList] = await Promise.all([
        sortField?.getFieldValueList?.(),
        ...findFields.map((f) => f?.getFieldValueList()!),
      ]);

      /**
       * 第2种比较函数
       *  比较2行(findFields除外)，
       *     - 字段完整度高的保留（即各个字段不为空），完整度低的被选中
       *     - 字段完整度一样的，保留最新的一条数据
       */
      async function chooseLatestRecord(recordA: string, recordB: string) {
        if (!choose2CacheInfo.current) {
          choose2CacheInfo.current = {
            exFieldsValueIdList: {},
            fieldListsExFindFields: [],
            modifiedFieldValueList: [],
            modifiedField: undefined
          }
        }
        if (!choose2CacheInfo?.current?.fieldListsExFindFields?.length) {
          let choosedFieldIds = Object.values(restFields)
          /*** 除了查找字段之外的字段实例 */
          const fieldListsExFindFields = fieldInfo?.fieldList.filter(({ id }) => {
            if (id && !choosedFieldIds.includes(id)) {
              return true
            }
            return false
          }) || [];
          choose2CacheInfo.current.fieldListsExFindFields = fieldListsExFindFields
        }
        const fieldListsExFindFields = choose2CacheInfo.current.fieldListsExFindFields
        /** 字段A和B的完整度 */
        let recordAFieldCount = 0, recordBFieldCount = 0
        if (fieldListsExFindFields?.length && !Object.keys(choose2CacheInfo.current.exFieldsValueIdList).length) {
          /** 除查找字段之外的字段的值列表；用于比较 */
          await Promise.allSettled(fieldListsExFindFields?.map(async (f) => {
            const valueList = await f.getFieldValueList();
            choose2CacheInfo.current!.exFieldsValueIdList[f.id] = valueList.map(({ record_id }) => record_id) as any;
            return {
              fieldId: f.id,
              fieldValueList: valueList
            }
          }))
        }

        for (const fieldId in choose2CacheInfo.current.exFieldsValueIdList) {
          if (Object.prototype.hasOwnProperty.call(choose2CacheInfo.current.exFieldsValueIdList, fieldId)) {
            const valueIdList = choose2CacheInfo.current.exFieldsValueIdList[fieldId];
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
            if (!choose2CacheInfo.current.modifiedFieldValueList?.length) {
              let modifiedFieldId = fieldInfo?.fieldMetaList.find(({ type }) => {
                return type == FieldType.ModifiedTime
              })?.id
              if (!modifiedFieldId) {
                // @ts-ignore
                modifiedFieldId = await tableInfo?.table.addField({
                  type: FieldType.ModifiedTime
                });
                toDelModifiedField.current = modifiedFieldId
              }
              const modifiedField = await tableInfo?.table.getFieldById(modifiedFieldId as any)
              const modifiedFieldValueList = await modifiedField?.getFieldValueList();
              choose2CacheInfo.current.modifiedField = modifiedField
              choose2CacheInfo.current.modifiedFieldValueList = (modifiedFieldValueList || []) as any
            }
            const recordAModifiedTime = choose2CacheInfo.current.modifiedFieldValueList.find(({ record_id }) => record_id === recordA)?.value || 0;
            const recordBModifiedTime = choose2CacheInfo.current.modifiedFieldValueList.find(({ record_id }) => record_id === recordB)?.value || 0;
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

      /** 
       * 第1种比较函数
       *  比较2行。保留 比较字段值更大的那一行 */
      function choose(recordA: string, recordB: string) {
        let findA =
          sortFieldValueList.find(({ record_id }) => record_id === recordA)?.value || 0;
        let findB =
          sortFieldValueList.find(({ record_id }) => record_id === recordB)?.value || 0;
        if (Array.isArray(findA)) {
          // @ts-ignore
          findA = findA.map(({ text, id, name }) => text || name || id).join("");
        }
        if (Array.isArray(findB)) {
          // @ts-ignore
          findB = findB.map(({ text, id, name }) => text || name || id).join("");
        }
        let valueA = findA;
        let valueB = findB;
        return valueA > valueB
          ? { keep: recordA, discard: recordB }
          : { keep: recordB, discard: recordA };
      }
      setFieldsValueLists({
        sortFieldValueList: {
          field: sortField,
          fieldMeta: fieldInfo?.fieldMetaList.find(({ id }) => sortField.id === id)!,
          valueList: sortFieldValueList,
        },
        identifyingFieldsValueList: findFields.map((f, index) => {
          return {
            field: f!,
            valueList: identifyingFieldsValueList[index],
            fieldMeta: fieldInfo?.fieldMetaList.find(({ id }) => f?.id === id)!,
          };
        }),
      });


      /** 所有值列表的行id */
      const allFieldIds = new Set<string>();
      identifyingFieldsValueList.forEach((v) => {
        v.forEach(({ record_id }) => {
          if (record_id) {
            allFieldIds.add(record_id);
          }
        });
      });

      const tasks = [...allFieldIds].map((recordId) => async () => {
        /** record这一行，字段1和字段2的值 */
        let key = JSON.stringify([
          ...identifyingFieldsValueList.map(
            (f) => f.find(({ record_id }) => record_id === recordId)?.value
          ),
        ]);
        if (key in existing) {
          let { keep, discard } = await chooseLatestRecord(recordId, existing[key]);
          toDeleteRecordIds.current.push(discard);
          if (toDelete[key]) {
            toDelete[key].push(discard);
          } else {
            toDelete[key] = [discard];
          }
          existing[key] = keep;
        } else {
          existing[key] = recordId;
        }
      })

      const step = 1;
      for (let index = 0; index < tasks.length; index += step) {
        const element = tasks.slice(index, index + step);
        await Promise.allSettled(element.map((f) => f()))
      }
      try {
        if (toDelModifiedField.current) {
          // @ts-ignore
          await tableInfo?.table.deleteField(toDelModifiedField.current)
          toDelModifiedField.current = undefined
        }
      } catch (e) {
        console.error(e);
      }
      setToDelete(toDelete);
      setExisting(existing);
      setLoading(false);
    }, 0);
  };

  /** 选择table的时候更新tableInfo和fieldInfo */
  const onSelectTable = async (t: any) => {
    if (tableInfo) {
      // 单选
      setLoading(true);
      const { tableList, tableMetaList } = tableInfo;
      const choosedTable = tableList.find(({ id }) => id === t)!;
      const choosedTableMeta = tableMetaList.find(({ id }) => id === t)!;
      setTableInfo({
        ...tableInfo,
        table: choosedTable,
        tableMeta: choosedTableMeta,
      });
      const [fieldMetaList, fieldList] = await Promise.all([
        choosedTable.getFieldMetaList(),
        choosedTable.getFieldList(),
      ]);

      setFieldInfo({
        fieldList,
        fieldMetaList,
        field: undefined,
        fieldMeta: undefined,
      });
      setLoading(false);
      formApi.current.setValues({
        table: choosedTable.id,
      });
    }
  };

  const onSelectField = (f: any) => {
    if (!tableInfo?.table) {
      Toast.error(t('select.table.1'));
      return;
    } else {
      const { fieldMetaList, fieldList } = fieldInfo!;
      const choosedField = fieldList.find(({ id }) => f === id)!;
      const choosedFieldMeta = fieldMetaList.find(({ id }) => f === id)!;
      setFieldInfo({
        ...fieldInfo,
        field: choosedField,
        fieldMeta: choosedFieldMeta,
      } as any);
    }
  };

  console.log(tableInfo, fieldInfo);

  const onDel = async (del: any) => {
    setLoading(true);
    await del();
    setLoading(false);
    setToDelete({});
    setExisting({});
  };

  const showTable =
    existing &&
    toDelete &&
    fieldInfo?.fieldMetaList &&
    fieldsValueLists &&
    tableInfo &&
    toDeleteRecordIds.current.length > 0;

  const fieldMetas =
    (Array.isArray(fieldInfo?.fieldMetaList) &&
      // 等待切换table的时候，拿到正确的fieldList
      fieldInfo?.fieldList[0]?.tableId === tableInfo?.table.id &&
      fieldInfo?.fieldMetaList) ||
    [];

  return (
    <div>
      <br />
      {t('info')}
      <br />
      <br />
      <Spin size="large" spinning={loading}>
        <Form
          labelPosition="left"
          labelAlign="right"
          wrapperCol={{ span: 16 }}
          labelCol={{ span: 8 }}
          getFormApi={(e: any) => (formApi.current = e)}
        >
          <Row>
            <Col span={18}>
              <Form.Select
                style={{ width: "100%" }}
                onChange={onSelectTable}
                label={t('label.table')}
                field="table"
              >
                {Array.isArray(tableInfo?.tableMetaList) &&
                  tableInfo?.tableMetaList.map(({ id, name }) => (
                    <Form.Select.Option key={id} value={id}>
                      {name}
                    </Form.Select.Option>
                  ))}
              </Form.Select>
            </Col>
            <Col span={6}></Col>
          </Row>

          <Row>
            <Col span={18}>
              <Form.Select
                style={{ width: "100%" }}
                onChange={onSelectField}
                label={t('label.field')}
                field="field"
              >
                {fieldMetas.map(({ id, name }) => (
                  <Form.Select.Option key={id} value={id}>
                    {name}
                  </Form.Select.Option>
                ))}
              </Form.Select>
            </Col>
            <Col span={6}>
              <div style={{
                paddingTop: '12px',
                paddingBottom: '12px',
              }}>
                {fieldInfo?.fieldMetaList && (
                  <Button
                    // theme="solid"
                    // type="primary"
                    // className="bt1"
                    disabled={!(count.current.size <= fieldInfo?.fieldMetaList.length - 1)}
                    onClick={() => {
                      count.current.add(getLast8Digits());
                      updateCom();
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'flex-start',
                      gap: '10px',
                      alignItems: 'center'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center'
                      }}><IconPlus /> </div>
                      <div>{t('add.btn')}</div>
                    </div>
                  </Button>
                )}

              </div>
            </Col>
          </Row>


          {[...count.current].map((v, index) => {
            let after = (
              <div
                style={{
                  paddingTop: '12px',
                  paddingBottom: '12px',
                }}
                onClick={() => {
                  count.current.delete(v);
                  updateCom();
                }}>
                <Button>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    gap: '10px'
                  }}>
                    <div><IconMinus /> </div>
                    <div>{t('btn.del')}</div>
                  </div>
                </Button>
              </div>
            );

            return (
              <Row key={v}>
                <Col span={18}>
                  <Form.Select
                    style={{ width: "100%" }}
                    onChange={onSelectField}
                    label={`     `}
                    field={v}
                  >
                    {fieldMetas.map(({ id, name }) => (
                      <Form.Select.Option key={id} value={id}>
                        {name}
                      </Form.Select.Option>
                    ))}
                  </Form.Select>
                </Col>
                <Col span={6}>{after}</Col>
              </Row>
            );
          })}

          {/* 另一种比较字段的方式,保留，后续看情况新增 */}
          {/* <Form.Select
                        style={{ width: "100%" }}
                        onChange={onSelectField}
                        label={{
                            text: "比较字段",
                            extra: (
                                <Tooltip content="重复的记录中,本字段值较大的那一行记录将被保留，较小的那一行记录将被删除">
                                    <IconHelpCircle style={{ color: "var(--semi-color-text-2)" }} />
                                </Tooltip>
                            ),
                        }}
                        field="field3"
                    >
                        {fieldMetas.map(({ id, name }) => (
                            <Form.Select.Option key={id} value={id}>
                                {name}
                            </Form.Select.Option>
                        ))}
                    </Form.Select> */}
        </Form>

        <Row>
          <Col span={6}></Col>
          <Col span={18}>
            <Button theme="solid" type="primary" className="bt1" onClick={del}>
              {t('btn.find')}
            </Button>
          </Col>
        </Row>
        {showTable ? (
          <div>
            <br />
            <br />
            <DelTable
              windowWidth={windowWidth}
              getOnDel={onDel}
              key={toDeleteRecordIds.current.join("")}
              defaultToDelRecords={toDeleteRecordIds.current}
              existing={existing}
              toDelete={toDelete}
              tableFieldMetaList={fieldInfo?.fieldMetaList}
              formFields={fieldsValueLists}
              fieldInfo={fieldInfo}
              tableInfo={tableInfo}
            ></DelTable></div>
        ) : (
          toDelete === undefined ? null : <div>{t('btn.empty')}</div>
        )}
      </Spin>
    </div>
  );
}
