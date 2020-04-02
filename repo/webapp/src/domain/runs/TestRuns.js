import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from "react-router"
import { useSelector } from 'react-redux'
import { useDispatch } from 'react-redux'
import {
    Card,
    CardHeader,
    CardBody,
    PageSection,
    Toolbar,
    ToolbarGroup,
    ToolbarItem,
    ToolbarSection

} from '@patternfly/react-core';
import {
    EditIcon,
} from '@patternfly/react-icons';
import { DateTime } from 'luxon';
import { NavLink } from 'react-router-dom';

import { byTest } from './actions';
import * as selectors from './selectors';

import { fetchTest } from '../tests/actions';
import { get } from '../tests/selectors';

import Table from '../../components/Table';

//TODO how to prevent rendering before the data is loaded? (we just have start,stop,id)
const renderCell = (render) => (arg) => {
    const { cell: { value, row: { index } }, data, column } = arg;
    if (!render) {
        return value
    }
    try {
        const useValue = (value === null || value === undefined) ? data[index][column.id.toLowerCase()] : value;
        const rendered = render(useValue, data[index])
        if (!rendered) {
            return "-"
        } else if (typeof rendered === "string") {
            //this is a hacky way to see if it looks like html :)
            if (rendered.trim().startsWith("<") && rendered.trim().endsWith(">")) {
                //render it as html
                return (<div dangerouslySetInnerHTML={{ __html: rendered }} />)
            } else {
                return rendered;
            }
        } else {
            return rendered;
        }
    } catch (e) {
        return "--"
    }
}


const staticColumns = [
    {
        Header: "Id", accessor: "id",
        Cell: (arg) => {
            const { cell: { value } } = arg;
            return (<NavLink to={`/run/${value}`}>{value}</NavLink>)
        }
    },
    { Header: "Start", accessor: v => window.DateTime.fromMillis(v.start).toFormat("yyyy-LL-dd HH:mm:ss ZZZ") },
    { Header: "Stop", accessor: v => window.DateTime.fromMillis(v.stop).toFormat("yyyy-LL-dd HH:mm:ss ZZZ") },
    //    These are removed because they assume the runs are specjEnterprise2010
    //    {
    //        "Header": "GC Overhead", "accessor": "gc", "jsonpath": "jsonb_path_query_array(data,'$.benchserver4.gclog[*] ? ( exists(@.capacity) )')",
    //        "render": (v)=>{
    //            const totalSeconds = v.reduce((total,entry)=>total+entry.seconds,0.0);
    //            const lastTimestamp = v[v.length-1].timestamp;
    //            return Number.parseFloat(100*totalSeconds/lastTimestamp).toFixed(3)+" %";
    //        }
    //    },
    //    { Header: "Scale", accessor: "scale", jsonpath: '$.faban.run.SPECjEnterprise."fa:runConfig"."fa:scale"."text()"' },
    //    { Header: "Ramp Up", accessor: "rampup", jsonpath: '$.faban.run.SPECjEnterprise."fa:runConfig"."fa:runControl"."fa:rampUp"."text()"' },
    //    { Header: "Faban ID", accessor: "fabanid", jsonpath: '$.faban.xml.benchResults.benchSummary.runId."text()"' },
]

export default () => {
    const { testId } = useParams();
    const test = useSelector(get(testId))
    const [columns, setColumns] = useState((test && test.defaultView) ? test.defaultView.components : [])
    const [data, setData] = useState(columns)
    const tableColumns = useMemo(() => {
        const rtrn = [...staticColumns]
        columns.forEach((col, index) => {
             rtrn.push({
                 Header: col.headerName,
                 accessor: `view[${index}]`,
                 Cell: renderCell(col.render)
             })
        })
        return rtrn;
    }, [columns]);

    const dispatch = useDispatch();
    const runs = useSelector(selectors.testRuns(testId));
    useEffect(() => {
        dispatch(fetchTest(testId));
    }, [dispatch, testId])
    useEffect(() => {
        dispatch(byTest(testId))
    }, [dispatch])
    useEffect(() => {
        if (test && test.defaultView) {
            setColumns(test.defaultView.components)
        }
    }, [test])
    useEffect(() => {
        setData(columns)
    }, [columns])
    return (
        <PageSection>
            <Card>
                <CardHeader>
                    <Toolbar className="pf-l-toolbar pf-u-justify-content-space-between pf-u-mx-xl pf-u-my-md" style={{ justifyContent: "space-between" }}>
                        <ToolbarGroup>
                            <ToolbarItem className="pf-u-mr-xl">{`Test: ${test.name || testId}`}</ToolbarItem>
                        </ToolbarGroup>
                        <ToolbarGroup>
                            <NavLink to={ `/test/${testId}` } ><EditIcon /></NavLink>
                        </ToolbarGroup>
                    </Toolbar>
                </CardHeader>
                <CardBody>
                    <Table columns={tableColumns} data={runs} />
                </CardBody>
            </Card>
        </PageSection>
    )
}