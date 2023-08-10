import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Table, Button, Checkbox, Form, Toast } from '@douyinfe/semi-ui';
import { Existing, ToDelete, FormFields, FieldInfo, TableInfo } from './App'
import { IFieldMeta as FieldMeta, IOpenCellValue, IWidgetField } from "@base-open/web-api";
import './table.css'
import { useTranslation } from 'react-i18next';

/** 渲染出需要展示的列表 */
function getColumns(
  f: {
    field: IWidgetField;
    fieldMeta: FieldMeta;
    valueList: any[];
    columnsConfig?: object;
  }[]
) {
  return f.map(({ field, fieldMeta, valueList, columnsConfig = {} }) => {
    return {
      title: fieldMeta.name,
      dataIndex: fieldMeta.id,
      render: (cellValue: IOpenCellValue) => {
        if (
          typeof cellValue === "string" ||
          typeof cellValue === "number" ||
          cellValue === null
        ) {
          return <div className="tableCell">{cellValue}</div>;
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
}: {
  existing: Existing;
  toDelete: ToDelete;
  /** 所有需要被展示的字段相关信息 */
  allFields: {
    field: IWidgetField;
    fieldMeta: FieldMeta;
    valueList: any[];
  }[];
}) {
  const rows: { key: string;[p: string]: any }[] = [];
  /** 重复行的计数器,用来控制斑马纹 */
  let c = 1;
  for (const key in toDelete) {
    const sameValueRecordIdArr: string[] = [existing[key]].concat(toDelete[key]);
    sameValueRecordIdArr.forEach((recordId) => {
      const r = {
        key: recordId,
      };
      const fieldsAndValues = Object.fromEntries(
        allFields.map(({ valueList, fieldMeta }) => {
          return [
            fieldMeta.id,
            valueList.find(({ record_id }) => record_id === recordId)?.value || null,
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
  field: IWidgetField;
  fieldMeta: FieldMeta;
  valueList: any[];
  columnsConfig: {
    fixed: true;
  };
}
[];

interface TableProps {
  /** 获得删除所选的行的回调函数 */
  getOnDel: (f: () => Promise<any>) => Promise<any>;
  existing: Existing;
  toDelete: ToDelete;
  tableFieldMetaList: FieldMeta[];
  /** 表达所选的fields关信息 */
  formFields: FormFields;
  fieldInfo: FieldInfo;
  tableInfo: TableInfo;
  /** 默认要被删除的行， */
  defaultToDelRecords: string[];
  windowWidth: number;
}

export default function DelTable(props: TableProps) {
  /** 固定列的字段信息 */
  const [moreFixedFields, setMoreFixedFields] = useState<MoreFixedFields[]>([
    { ...props.formFields.sortFieldValueList, columnsConfig: { fixed: true } },
  ]);
  const { t } = useTranslation();
  const formApi = useRef<any>();
  const { windowWidth } = props;
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState(props.defaultToDelRecords);
  const scroll = { y: 320, x: windowWidth + 100 }; // x: 所有列的宽度总和
  const style = { width: windowWidth, margin: "0 auto" }; // width: 表格的宽度
  const fixedFields = moreFixedFields;
  const scrollFields = props.formFields.identifyingFieldsValueList.filter(({ field }) => {
    return !fixedFields.some((fixedField) => {
      return fixedField.field.id === field.id;
    });
  });
  console.log({ fixedFields, scrollFields });
  /** table展示的所有字段信息 */
  const allFields = [...fixedFields, ...scrollFields];

  const columns = getColumns(allFields);
  const data = getData2({ existing: props.existing, toDelete: props.toDelete, allFields });

  console.log({ columns, data });

  const rowSelection = {
    onChange: (_selectedRowKeys: any) => {
      setSelectedRowKeys(_selectedRowKeys);
    },
    selectedRowKeys,
    fixed: true,
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
      let res = await Promise.all(
        selectedRowKeys.map((re) => props.tableInfo?.table.deleteRecord(re))
      );
      Toast.success(t('del.success', { num: selectedRowKeys.length }));
      return res;
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
        const valueList = await props.fieldInfo.fieldList
          .find((f) => f.id === fieldId)!
          .getFieldValueList();
        arr.push({
          field: props.fieldInfo.fieldList.find((f) => f.id === fieldId)!,
          fieldMeta: props.fieldInfo.fieldMetaList.find(({ id }) => id === fieldId)!,
          valueList,
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
        <div style={{
          display: 'flex',
          gap: '20px',
          alignItems: "center"
        }}>
          <div>
            {t('find.total', { num: selectedRowKeys.length })}
          </div>
          <Button className="bt2" theme="solid" type="secondary" onClick={onDel}>
            {t('del.btn.2')}
          </Button>
        </div>
      ) : null}
      <br />
      <p style={{ fontSize: "14px" }}>
        {t('table.top.info')}
      </p>
      <Form labelPosition="left" labelAlign="right" getFormApi={(e: any) => (formApi.current = e)}>
        {Array.isArray(moreFieldsMetaLists) &&
          moreFieldsMetaLists.length > 0 &&
          props.formFields.sortFieldValueList.fieldMeta.id && (
            <Form.Select
              multiple
              initValue={[props.formFields.sortFieldValueList.fieldMeta.id]}
              style={{ width: "100%" }}
              onChange={onSelectMoreFixed}
              label={t('table.fixed.field')}
              field="moreFixed"
            >
              {moreFieldSelections}
            </Form.Select>
          )}
      </Form>
      <br />
      <Table
        loading={loading}
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
