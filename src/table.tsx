import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Table, Button, Checkbox, Form, Toast, Col, Row, Tooltip } from '@douyinfe/semi-ui';
import { Existing, ToDelete, FormFields, FieldInfo, TableInfo } from './types'
import { IFieldMeta as FieldMeta, FieldType, IOpenCellValue, IField, bitable, PermissionEntity, OperationType } from "@lark-base-open/js-sdk";
import './table.less'
import { useTranslation } from 'react-i18next';
import { IconAlarm, IconAlertCircle, IconEyeOpened, IconHelpCircle } from '@douyinfe/semi-icons';

/** 渲染出需要展示的列表 */
function getColumns(
  f: {
    field: IField;
    fieldMeta: FieldMeta;
    valueList: Map<string, {
      [fieldId: string]: IOpenCellValue;
    }>;
    columnsConfig?: object;
  }[]
) {
  return f.map(({ field, fieldMeta, valueList, columnsConfig = {} }) => {
    return {
      title: fieldMeta.name,
      dataIndex: fieldMeta.id,
      render: (cellValue: IOpenCellValue) => {
        let renderValue = '';
        if (fieldMeta.type === FieldType.DateTime || fieldMeta.type === FieldType.CreatedTime || fieldMeta.type === FieldType.ModifiedTime && cellValue) {
          if (typeof cellValue !== 'number') {
            return '';
          }
          try {
            renderValue = new Date(cellValue < 9999999999 ? cellValue * 1000 : cellValue).toString()
          } catch (error) {
            console.log(5, error);

          }
        }
        if (
          typeof cellValue === "string" ||
          typeof cellValue === "number" ||
          cellValue === null
        ) {
          return <div className="tableCell">{renderValue || cellValue}</div>;
        }
        if (Array.isArray(cellValue)) {
          return (
            <div className="tableCell">
              {
                // 这些属性不一定有
                cellValue.map((c) => {
                  if (c === null) {
                    return null
                  }
                  if (typeof c !== "object") {
                    return String(c);
                  }
                  // @ts-ignore
                  const { text, link, name, address, full_address, en_name, email } = c;
                  if (link) {
                    return <a title={link}>{text}</a>;
                  }
                  return text || name || address || full_address || en_name || email;
                })
              }
            </div>
          );
        }
        if (typeof cellValue === "boolean") {
          return <Checkbox checked={cellValue}></Checkbox>;
        }
        if (typeof cellValue === 'object' && cellValue !== null) {
          // @ts-ignore
          const showValue = cellValue.text || cellValue.email || cellValue.full_address || cellValue.address || cellValue.name || cellValue.en_name
          return <div>
            {showValue}
          </div>
        }
      },
      ...columnsConfig,
    };
  });
}
/** 获取将要被展示的所有行,allFields: */
function getData2({
  existing,
  toDelete,
  allFields,
  viewRecordsList,
  selectedRowKeys
}: {
  existing: Existing;
  toDelete: ToDelete;
  selectedRowKeys: string[];
  viewRecordsList: string[];
  /** 所有需要被展示的字段相关信息 */
  allFields: {
    field: IField;
    fieldMeta: FieldMeta;
    valueList: Map<string, {
      [fieldId: string]: IOpenCellValue;
    }>;
  }[];
}) {
  const rows: { key: string;[p: string]: any }[] = [];
  /** 重复行的计数器,用来控制斑马纹 */
  let c = 1;
  for (const key in toDelete) {
    const sameValueRecordIdArr: string[] = [existing[key]].concat(toDelete[key]);
    sameValueRecordIdArr.sort((a, b) => {
      if (!selectedRowKeys.includes(a)) {
        return -1;
      }
      if (!selectedRowKeys.includes(b)) {
        return 1;
      }
      return viewRecordsList.indexOf(a) - viewRecordsList.indexOf(b)
    }).forEach((recordId) => {
      const r = {
        key: recordId,
      };
      const fieldsAndValues = Object.fromEntries(
        allFields.map(({ valueList, fieldMeta }) => {
          return [
            fieldMeta.id,
            // valueList.find(({ record_id }) => record_id === recordId)?.value || null,
            valueList.get(recordId)?.[fieldMeta.id]
          ];
        })
      );
      rows.push({
        ...r,
        ...fieldsAndValues,
        c: c,
      });
    });
    c++;
  }
  return rows;
}

/** 更多的左侧固定的列表 */
interface MoreFixedFields {
  field: IField;
  fieldMeta: FieldMeta;
  valueList: Map<string, {
    [fieldId: string]: IOpenCellValue;
  }>;
  columnsConfig: {
    fixed: true;
  };
}
[];

interface TableProps {
  resTime: number;
  /** 获得删除所选的行的回调函数 */
  getOnDel: (f: () => Promise<any>) => Promise<any>;
  existing: Existing;
  setLoadingContent: (arg: string) => any,
  setLoading: (arg: boolean) => any,
  toDelete: ToDelete;
  tableFieldMetaList: FieldMeta[];
  /** 表达所选的fields关信息 */
  formFields: FormFields;
  fieldInfo: FieldInfo;
  tableInfo: TableInfo;
  /** 默认要被删除的行， */
  defaultToDelRecords: string[];
  windowWidth: number;
  recordIdValueMap: Map<string, {
    [fieldId: string]: IOpenCellValue;
  }>;
  findInView: boolean;
  viewRecordsList: string[]
}

export default function DelTable(props: TableProps) {
  /** 固定列的字段信息 */
  const [moreFixedFields, setMoreFixedFields] = useState<MoreFixedFields[]>([]);
  useEffect(() => {
    setMoreFixedFields([
      { ...props.formFields.sortFieldValueList, columnsConfig: { fixed: true } },
    ])
  }, [])
  const [showDetailRecord, setShowDetailRecord] = useState('');
  const [hasTableDelPermission, setHasTableDelPermission] = useState(false);
  const { t } = useTranslation();
  const formApi = useRef<any>();
  const { windowWidth, setLoading, setLoadingContent } = props;
  const [selectedRowKeys, setSelectedRowKeys] = useState(props.defaultToDelRecords);
  const scroll = { y: 320, x: windowWidth + 100 }; // x: 所有列的宽度总和
  const style = { width: windowWidth, margin: "0 auto" }; // width: 表格的宽度
  const fixedFields = moreFixedFields;
  const [data, setData] = useState<{
    [p: string]: any;
    key: string;
  }[]>([]);
  const scrollFields = props.formFields.identifyingFieldsValueList.filter(({ field }) => {
    return !fixedFields.some((fixedField) => {
      return fixedField.field.id === field.id;
    });
  });
  /** table展示的所有字段信息 */
  const allFields = [...fixedFields, ...scrollFields];

  useEffect(() => {
    props.setLoading(true);
    bitable.base.getPermission({
      entity: PermissionEntity.Record,
      param: {
        tableId: props.tableInfo.table.id,
      },
      type: OperationType.Deletable,

    }).then((v) => {
      if (v) {
        setHasTableDelPermission(true);
      }
    }).finally(() => {
      props.setLoading(false);
    })
  }, [props.tableInfo.table.id])

  const columns = getColumns(allFields);
  useLayoutEffect(() => {
    props.setLoading(true);
    setTimeout(() => {
      const data = getData2({ existing: props.existing, toDelete: props.toDelete, allFields, viewRecordsList: props.viewRecordsList, selectedRowKeys });
      props.setLoading(false);
      setData(data);
    }, 0);
  }, [props.resTime, moreFixedFields.length]);


  const rowSelection = {
    onChange: (_selectedRowKeys: any) => {
      setSelectedRowKeys(_selectedRowKeys);
    },
    selectedRowKeys,
    fixed: true,
    columnWidth: 80,
    renderCell: props.findInView ? (p: any) => {
      const recordId = p.record.key
      return <div className={`table-row-selection-container ${showDetailRecord === recordId ? 'table-row-selection-container-view-detail' : ''}`}>

        {p.originNode} <span className='table-row-selection-container-rowId'>{recordId && props.viewRecordsList.indexOf(recordId) + 1}</span>

        <div onClick={() => {
          setShowDetailRecord(recordId);
          bitable.ui.showRecordDetailDialog({
            tableId: props.tableInfo.table.id,
            recordId
          }).finally(() => {
            setShowDetailRecord('');
          })
        }}
          style={{ display: recordId === showDetailRecord ? 'block' : undefined }}
          className='table-row-selection-container-view-detail-icon'>
          <IconEyeOpened />
        </div>
      </div>
    } : undefined
  };

  const handleRow = (record: any) => {
    // 给偶数行设置斑马纹
    if (record.c % 2 === 0) {
      return {
        style: {
          "--diff-bg-color": "var(--diff-bg-color-1)",
          background: "var(--diff-bg-color)",
        },
      };
    } else {
      return {};
    }
  };
  const onDel = () => {
    props.getOnDel(async () => {
      // let res = await Promise.all(
      //   selectedRowKeys.map((re) => props.tableInfo?.table.deleteRecord(re))
      // );
      const total = selectedRowKeys.length


      /** 一次删除n行 */
      const step = 5000;
      let delLength = 0
      for (let index = 0; index < selectedRowKeys.length; index += step) {
        const records = selectedRowKeys.slice(index, index + step);
        /** 停顿一会再删除 */
        const sleep = records.length
        await props.tableInfo.table.deleteRecords(records).catch((e) => {
          console.log('error===', e);
          console.log('records', records);
          /** 删除这个的时候出问题了
           [
    "recujTADBbipn2",
    "recujTADBb94Hj",
    "recujTADBbGKXZ",
    "recujTADBbfQv1",
    "recujTADBbnwyz",
    "recujTADBbvlhV",
    "recujTADBb8NmW",
    "recujTADBbHvw8",
    "recujTADBbvy2M",
    "recujTADBb7Gxw"
] 
           
           */
        })
        delLength += records.length;
        setLoadingContent(t('remain.records.num', { total, num: delLength }))
        await new Promise((resolve) => setTimeout(() => {
          resolve('')
        }, sleep))
      }
      Toast.success({ content: t('del.success', { num: selectedRowKeys.length }), duration: 3 });
      setSelectedRowKeys([]);
      setLoadingContent('')
    });
  };

  const moreFieldsMetaLists = props.tableFieldMetaList
    .filter(({ id }) => {
      return !allFields.some(({ fieldMeta }) => {
        return fieldMeta.id === id;
      });
    })
    .concat(props.formFields.sortFieldValueList.fieldMeta);
  const onSelectMoreFixed = async (fieldIds: any) => {
    setLoading(true);
    const arr: MoreFixedFields[] = [];
    await Promise.all(
      fieldIds.map(async (fieldId: string) => {
        arr.push({
          field: props.fieldInfo.fieldList.find((f) => f.id === fieldId)!,
          fieldMeta: props.fieldInfo.fieldMetaList.find(({ id }) => id === fieldId)!,
          valueList: props.recordIdValueMap,
          columnsConfig: {
            fixed: true,
          },
        });
      })
    ).finally(() => {
      setLoading(false);
    });
    setMoreFixedFields(arr);
  };

  const moreFieldSelections = moreFieldsMetaLists.map(({ id, name }) => (
    <Form.Select.Option key={id} value={id}>
      {name}
    </Form.Select.Option>
  ));

  // useEffect(() => {
  //     formApi.current.setValue('moreFixed', [props.formFields.sortFieldValueList.fieldMeta.id])
  // }, [])

  // if (!Array.isArray(moreFieldsMetaLists) && moreFieldsMetaLists.length > 0 && props.formFields.sortFieldValueList.fieldMeta.id) {
  //     return null
  // }

  return (
    <div className="tableRoot_lkwuf98oij">
      {selectedRowKeys.length > 0 ? (
        <Row>
          <Col style={{ height: '32px', textAlign: 'right', display: 'flex', alignItems: 'center', paddingRight: '20px', justifyContent: 'flex-end', gap: '4px' }} span={6}>
            {t('find.total', { num: selectedRowKeys.length })}
            <Tooltip position='right' content={t('table.top.info')}><IconHelpCircle style={{ color: 'darkgray' }} /></Tooltip>
          </Col>
          <Col style={{ display: 'flex', alignItems: 'center', gap: '12px' }} span={18}>
            <Button disabled={!selectedRowKeys.length || !hasTableDelPermission} className="bt2" theme="solid" type="secondary" onClick={onDel}>
              {t('del.btn.2')}
            </Button>
            {<Tooltip content={t('info.has.no.deletePermission')}>
              {!hasTableDelPermission && <IconAlertCircle style={{ color: 'red' }} />}
            </Tooltip>}
          </Col>
        </Row>
      ) : null}
      {/* <p className='table-desc'>
        {t('table.top.info')}
      </p> */}
      <Form wrapperCol={{ span: 16 }}
        labelCol={{ span: 8 }}
        labelPosition="left"
        labelAlign="right"
        getFormApi={(e: any) => (formApi.current = e)}>
        {Array.isArray(moreFieldsMetaLists) &&
          moreFieldsMetaLists.length > 0 &&
          props.formFields.sortFieldValueList.fieldMeta.id && (<Row>
            <Col span={18}>
              <Form.Select
                multiple
                initValue={[props.formFields.sortFieldValueList.fieldMeta.id]}
                style={{ width: "100%" }}
                onChange={onSelectMoreFixed}
                label={<div className="help-field-label">{t('table.fixed.field')}<Tooltip position='right' content={t('table.fixed.field.help')}><IconHelpCircle style={{ color: 'darkgray' }} /></Tooltip></div>}
                field="moreFixed"
              >
                {moreFieldSelections}
              </Form.Select>
            </Col>
            <Col span={6}></Col>
          </Row>
          )}
      </Form>
      <Table
        onRow={handleRow}
        pagination={false}
        columns={columns}
        dataSource={data}
        scroll={scroll}
        style={style}
        virtualized
        rowSelection={rowSelection}
      />
    </div>
  );
}


