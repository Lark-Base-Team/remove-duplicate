import { IFieldMeta as FieldMeta, IField, ITable, ITableMeta, bitable, FieldType, IFilterInfo, FilterOperator, FilterConjunction, IGridView, ViewType } from "@lark-base-open/js-sdk";
import { useEffect, useState, useRef, useMemo } from "react";
import { Form, Toast, Spin, Tooltip, Button, Col, Row, Checkbox } from "@douyinfe/semi-ui";
import { IconHelpCircle, IconPlus, IconMinus, IconClose } from "@douyinfe/semi-icons";
import DelTable from "./table";
import { useTranslation } from 'react-i18next';
import { initChoose2CacheInfo, chooseLatestRecord, getCompareRecords } from "./compare";
import { getLast8Digits } from "./utils";
import { ToDelete, Existing, FormFields, TableInfo, FieldInfo, CompareType } from "./types";


const NumberTypeField = [FieldType.Number, FieldType.AutoNumber, FieldType.Currency, FieldType.DateTime, FieldType.Progress, FieldType.Rating, FieldType.CreatedTime, FieldType.ModifiedTime]


/** 表格，字段变化的时候刷新插件 */
export default function Ap() {
  const [key, setKey] = useState<string | number>(0);
  const [tableList, setTableList] = useState<ITable[]>([]);
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


function T() {
  const [windowWidth, setWindowWidth] = useState(document.body.clientWidth);
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<ToDelete>();
  const [existing, setExisting] = useState<Existing>();
  const [loadingContent, setLoadingContent] = useState('')

  const checkboxConfig = useRef({ findInCurrentView: true })

  const currentViewConfig = useRef({
    currentViewRecords: ['']
  })

  const [saveByField, setSaveByField] = useState('');
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

  // 初始化
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
        // 设置表单初始值
        formApi.current.setValues({ table: tableRes.id, saveBy: CompareType.SaveByCompletion });

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

  /** 点击预览删除 */
  const deletepriview = async () => {
    const { table, firstCompareFieldId, saveBy, compareFieldId, ...restFields } = formApi.current.getValues();
    let keys = Object.keys(restFields);

    if ((!keys.length && !firstCompareFieldId) ||
      ([CompareType.SaveByBiggerField, CompareType.SaveBySmaller].includes(saveBy) && !compareFieldId)
    ) {
      Toast.error(t("select.field.1"));
      return;
    }
    setLoading(true);
    setTimeout(async () => {
      try {
        let { table: selectTableId, saveBy, compareFieldId, ...restFields }: {
          saveBy: CompareType,
          [p: string]: string
        } = formApi.current.getValues();
        const table = await bitable.base.getTableById(selectTableId);

        const findInCurrentView = checkboxConfig.current.findInCurrentView;
        if (findInCurrentView) {
          const { viewId } = await bitable.base.getSelection();
          if (!viewId) {
            throw t('请打开一个表格视图')
          }
          const view = await table.getViewById(viewId!)
          const viewType = await view.getType()

          if (viewType !== ViewType.Grid) {
            throw t('请打开一个表格视图')
          }

          const viewRecordsList = await view.getVisibleRecordIdList();

          currentViewConfig.current = {
            currentViewRecords: viewRecordsList as any
          }
        }

        /** 所有的比较字段 */
        restFields = JSON.parse(JSON.stringify(restFields));

        let keys = Object.keys(restFields);
        const firstCompareFieldId = restFields.firstCompareFieldId ?? restFields[keys[0]]

        /**key为cell的值，value为recordId */
        let existing = Object.create(null);
        let toDelete: ToDelete = {};
        toDeleteRecordIds.current = [];

        const currentFieldList = await table.getFieldList();

        /** 所有查找字段实例 */
        const findFields = keys
          .map((f) => currentFieldList.find(({ id }) => id === restFields[f]))
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
            fieldList: currentFieldList,
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
        /** firstCompareFieldId 第一个用来比较的字段 */
        const sortField = currentFieldList.find(({ id }) => id === firstCompareFieldId)! || currentFieldList[0];
        //sortFieldValueList:firstCompareFieldId，用来比较的字段的值列表, identifyingFieldsValueList：其余查找字段值列表数组
        const [sortFieldValueList, ...identifyingFieldsValueList] = await Promise.all([
          sortField?.getFieldValueList?.(),
          ...findFields.map(async (f) => {
            const valueList = await f?.getFieldValueList()!
            if (findInCurrentView) {
              return valueList.filter(({ record_id }) => currentViewConfig.current.currentViewRecords.includes(record_id as any))
            }

            return valueList
          }),
        ]);

        setFieldsValueLists({
          sortFieldValueList: {
            field: sortField,
            fieldMeta: currentFieldsMetas.find(({ id }) => sortField.id === id)!,
            valueList: sortFieldValueList,
          },
          identifyingFieldsValueList: findFields.map((f, index) => {
            return {
              field: f!,
              valueList: identifyingFieldsValueList[index],
              fieldMeta: currentFieldsMetas.find(({ id }) => f?.id === id)!,
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

        const { beforeCompare, compare: compareRecords, afterCompare } = getCompareRecords({ type: saveBy })
        beforeCompare()
        const tasks = [...allFieldIds].map((recordId) => async () => {
          /** record这一行，字段1和字段2的值 */
          let key = JSON.stringify([
            ...identifyingFieldsValueList.map(
              (f) => f.find(({ record_id }) => record_id === recordId)?.value
            ),
          ]);
          if (key in existing) {

            const { keep, discard } = await compareRecords({
              recordA: recordId,
              recordB: existing[key],
              toDelModifiedField,
              table,
              choosedFieldIds: Object.values(restFields),
              fieldList: currentFieldList ?? [],
              fieldMetaList: currentFieldsMetas ?? [],
              compareType: saveBy,
              compareFieldId
            });
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

        try {
          for (let index = 0; index < tasks.length; index++) {
            const task = tasks[index]
            await task()
          }
        } catch (error) {
          Toast.error(JSON.stringify(error))
        }

        afterCompare(async () => {
          try {
            if (toDelModifiedField.current) {
              // @ts-ignore
              await tableInfo?.table.deleteField(toDelModifiedField.current)
              toDelModifiedField.current = undefined
            }
          } catch (e) {
            console.error(e);
          }
        })

        setToDelete(toDelete);
        setExisting(existing);
        setLoading(false);
      } catch (error) {
        console.error(error)
        Toast.error(JSON.stringify(error))

      }
    }
      , 0);
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
        saveBy: CompareType.SaveByCompletion,
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
      <Spin style={{ height: '100vh' }} tip={loadingContent} size="large" spinning={loading}>
        <br />
        {t('info')}
        <br />
        <br />
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
                filter
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
                filter
                label={<div className="help-field-label">{t('label.field')} {<Tooltip position="right" content={t('find.field.help', { t: t('label.field') })}><IconHelpCircle style={{ color: 'darkgray' }} /></Tooltip>}</div>}
                field="firstCompareFieldId"
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
                    filter
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

          <Row>
            <Col span={18}>
              <Form.Select onChange={(e) => setSaveByField(e as string)} style={{ width: "100%" }} field="saveBy" label={t('save.by.label')}>

                <Form.Select.Option value={CompareType.SaveByCompletion}>
                  {/* 字段完整度高的保留（即各个字段不为空），完整度低的被选中
                  - 字段完整度一样的，保留最新的一条数据 */}
                  <div className="optionWithHelpIcon">
                    {t('CompareType.SaveByCompletion.label')}<Tooltip content={t('CompareType.SaveByCompletion.desc')}><IconHelpCircle style={{ color: 'darkgray' }} /></Tooltip>
                  </div>
                </Form.Select.Option>
                <Form.Select.Option value={CompareType.SaveByEarliestCreate}>
                  {/* 保留最早创建的 */}
                  {t('CompareType.SaveByEarliestCreate.label')}
                </Form.Select.Option>

                <Form.Select.Option value={CompareType.SaveByLatestCreate}>
                  {/* 保留最近创建的 */}
                  {t('CompareType.SaveByLatestCreate.label')}
                </Form.Select.Option>

                <Form.Select.Option value={CompareType.SaveByRecentEdit}>
                  {/* 保留最近编辑的 */}
                  {t('CompareType.SaveByRecentEdit.label')}
                </Form.Select.Option>

                <Form.Select.Option value={CompareType.SaveByOlderEdit}>
                  {/* 保留较旧的编辑 */}
                  {t('CompareType.SaveByOlderEdit.label')}
                </Form.Select.Option>

                <Form.Select.Option value={CompareType.SaveByBiggerField}>
                  {/* 保留自定义较大的字段 */}
                  {t('CompareType.SaveByBiggerField.label')}
                </Form.Select.Option>

                <Form.Select.Option value={CompareType.SaveBySmaller}>
                  {/* 保留自定义较小的字段 */}
                  {t('CompareType.SaveBySmaller.label')}
                </Form.Select.Option>

              </Form.Select>
            </Col>
            <Col span={6}></Col>
          </Row>
          <Row style={{ display: (saveByField === CompareType.SaveBySmaller || saveByField === CompareType.SaveByBiggerField) ? 'flex' : 'none' }}>
            <Col span={18}>
              <Form.Select filter style={{ width: "100%" }} field="compareFieldId" label={t('compareField.label')}>
                {fieldMetas.filter((v) => NumberTypeField.includes(v.type)).map(({ id, name }) => (
                  <Form.Select.Option key={id} value={id}>
                    {name}
                  </Form.Select.Option>
                ))}
              </Form.Select>
            </Col>
            <Col span={6}></Col>
          </Row>
        </Form>

        <Row>
          <Col span={6}></Col>
          <Col span={18}>
            <Checkbox
              defaultChecked={checkboxConfig.current.findInCurrentView}
              onChange={(e) => {
                checkboxConfig.current = {
                  ...checkboxConfig.current,
                  findInCurrentView: !!e.target.checked
                }
              }}>{t('find.in.current.view')}</Checkbox>
          </Col>
        </Row>
        <div className="field-row-divider"></div>

        <Row>
          <Col span={6}></Col>
          <Col span={18}>
            <Button theme="solid" type="primary" className="bt1" onClick={deletepriview}>
              {t('btn.find')}
            </Button>
          </Col>
        </Row>
        {showTable ? (
          <div>
            <DelTable
              windowWidth={windowWidth}
              setLoadingContent={setLoadingContent}
              setLoading={setLoading}
              getOnDel={onDel}
              key={toDeleteRecordIds.current.join("")}
              defaultToDelRecords={toDeleteRecordIds.current}
              existing={existing}
              toDelete={toDelete}
              tableFieldMetaList={fieldInfo?.fieldMetaList}
              formFields={fieldsValueLists}
              fieldInfo={fieldInfo}
              tableInfo={tableInfo}
              viewRecordsList={currentViewConfig.current.currentViewRecords}
              findInView={checkboxConfig.current.findInCurrentView}
            ></DelTable></div>
        ) : (
          toDelete === undefined ? null : <div>{t('btn.empty')}</div>
        )}
      </Spin>
    </div>
  );
}
