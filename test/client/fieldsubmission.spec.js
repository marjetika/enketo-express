/* global describe, it, beforeEach*/
'use strict';

var chai = require( 'chai' );
var expect = chai.expect;
var chaiAsPromised = require( 'chai-as-promised' );
var FieldSubmissionQueue = require( '../../public/js/src/module/field-submission-queue.js' );

chai.use( chaiAsPromised );

var getFormDataFieldValue = function( fieldName, fd ) {
    return fd.getAll( fieldName );
};

var getFormDataFields = function( fd ) {
    var entries = fd.entries();
    var entry = entries.next();
    var obj = {};

    while ( !entry.done ) {
        console.log( 'entry', entry );
        obj[ entry[ 0 ] ] = entry[ 1 ];
        entry = entries.next();
    }
    return obj;
};

describe( 'Field Submission', function() {
    var p1 = '/a/b/c';
    var p2 = '/a/r[3]/d';
    var id = 'abc';

    describe( 'queue', function() {

        it( 'adds items', function() {
            var q = new FieldSubmissionQueue();
            q.add( p1, '1', id );
            q.add( p2, 'a', id );
            expect( Object.keys( q.get() ).length ).to.equal( 2 );
            expect( q.get()[ p1 ] ).to.be.an.instanceOf( FormData );
            expect( q.get()[ p2 ] ).to.be.an.instanceOf( FormData );
            expect( q.get()[ p1 ].getAll( p1 ) ).to.deep.equal( [ '1' ] );
            expect( q.get()[ p2 ].getAll( p2 ) ).to.deep.equal( [ 'a' ] );
        } );

        it( 'overwrites older values in the queue for the same node', function() {
            var q = new FieldSubmissionQueue();
            q.add( p1, '1', id );
            q.add( p1, '2', id );
            expect( Object.keys( q.get() ).length ).to.equal( 1 );
            expect( q.get()[ p1 ] ).to.be.an.instanceOf( FormData );
            expect( q.get()[ p1 ].getAll( p1 ) ).to.deep.equal( [ '2' ] );
        } );

    } );

    describe( 'queue manages submission failures and successes', function() {
        var q;
        var i;
        var failSubmitOne = function() {
            return Promise.reject( new Error( 'Error: 400' ) );
        };
        var succeedSubmitOne = function() {
            return Promise.resolve( 201 );
        };
        var succeedFailSubmitOne = function() {
            i++;
            if ( i % 2 === 0 ) {
                return failSubmitOne();
            }
            return succeedSubmitOne();
        };

        beforeEach( function() {
            i = 0;
            q = new FieldSubmissionQueue();
            q.add( p1, '1', id );
            q.add( p2, 'a', id );
        } );

        it( 'removes a queue item if submission was successful', function() {
            q._submitOne = succeedSubmitOne;

            var updatedQueueKeys = q.submitAll()
                .then( function( results ) {
                    return Object.keys( q.get() );
                } );
            return expect( updatedQueueKeys ).to.eventually.deep.equal( [] );
        } );

        it( 'retains a queue item if submission failed', function() {
            q._submitOne = failSubmitOne;

            var updatedQueueKeys = q.submitAll()
                .then( function( results ) {
                    return Object.keys( q.get() );
                } );
            return expect( updatedQueueKeys ).to.eventually.deep.equal( [ p1, p2 ] );
        } );

        it( 'retains a queue item if submission failed', function() {
            q._submitOne = succeedFailSubmitOne;

            var updatedQueueKeys = q.submitAll()
                .then( function( results ) {
                    return Object.keys( q.get() );
                } );
            return expect( updatedQueueKeys ).to.eventually.deep.equal( [ p2 ] );
        } );

        it( 'if a field is updated during a failing submission attempt, ' +
            'the old field submission will not be retained in the queue',
            function() {
                q._submitOne = succeedFailSubmitOne;

                var updatedQueue = q.submitAll()
                    .then( function( results ) {
                        return q.get();
                    } );
                // this will complete before updatedQueueKeys is resolved!
                q.add( p2, 'b', id );

                return Promise.all( [
                    expect( updatedQueue ).to.eventually.have.property( p2 ).and.satisfy( function( fd ) {
                        return fd.getAll( p2 ).toString() === [ 'b' ].toString();
                    } ),
                    expect( updatedQueue ).to.eventually.not.have.property( p1 )
                ] );
            } );
    } );

    // TODO
    // * timeout


} );
